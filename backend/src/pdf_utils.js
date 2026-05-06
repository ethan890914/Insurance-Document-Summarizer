const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { extractCoverageAndExclusionsWithGemini } = require("./llm_utils");

function isPdfFile({ originalname, mimetype }) {
  return (
    mimetype === "application/pdf" ||
    originalname.toLowerCase().endsWith(".pdf")
  );
}

function runPythonOcr(pdfPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "..", "ocr", "extract_text.py");
    const pythonCmd = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonCmd, [scriptPath, "--pdf", pdfPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      let parsed;
      try {
        parsed = JSON.parse(stdout || "{}");
      } catch (err) {
        reject(new Error(`Invalid OCR JSON output. stderr=${stderr}`));
        return;
      }

      if (code !== 0 || !parsed.ok) {
        reject(
          new Error(
            `OCR extraction failed. code=${code}; error=${parsed.error || stderr || "unknown"}`,
          ),
        );
        return;
      }

      resolve(parsed);
    });
  });
}

async function extractPdfTextFromBuffer(buffer, pdfId) {
  const tempPdfPath = path.join(os.tmpdir(), `pdf-upload-${pdfId}.pdf`);
  fs.writeFileSync(tempPdfPath, buffer);

  try {
    return await runPythonOcr(tempPdfPath);
  } finally {
    fs.rmSync(tempPdfPath, { force: true });
  }
}

const PATTERNS = {
  policy_number: /\b([A-Z]{2,6}[-\s]?\d{2,4}[-\s]?\d{4,8}(?:[-\s]?\d{2})?)\b/,

  date: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{2,4})\b/gi,

  premium:
    /(?:USD\s?|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)\s?(?:USD|dollars?)/gi,

  limit:
    /(?:limit|coverage|up\s+to|not\s+to\s+exceed)[^\n]{0,40}(?:\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|\b(\d+(?:\.\d+)?)\s?([MK]))/gi,


  named_insured:
    /(?:named\s+insured|insured(?:\s+name)?|policyholder)[:\s]+([A-Z][^\n]{3,80})/i,
};

function normalizeDate(raw) {
  const clean = raw.trim().replace(/,$/, "");

  const formats = [
    // MM/DD/YYYY or MM-DD-YYYY
    {
      re: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/,
      parse: (m) => {
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return new Date(
          `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
        );
      },
    },
    // Month DD, YYYY  (January 15, 2024 / Jan 15 2024 / Jan. 15, 2024)
    {
      re: /^([A-Za-z]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/,
      parse: (m) =>
        new Date(`${m[1].replace(".", "").slice(0, 3)} ${m[2]} ${m[3]}`),
    },
    // DD-Mon-YYYY  (15-Jan-2024)
    {
      re: /^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/,
      parse: (m) => {
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return new Date(`${m[2].slice(0, 3)} ${m[1]} ${year}`);
      },
    },
  ];

  for (const { re, parse } of formats) {
    const m = clean.match(re);
    if (m) {
      const d = parse(m);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function normalizeAmount(raw, multiplierChar = "") {
  if (!raw) return null;
  const value = parseFloat(raw.replace(/,/g, "").replace(/\$/g, "").trim());
  if (isNaN(value)) return null;
  const m = multiplierChar.toUpperCase();
  if (m === "M") return value * 1_000_000;
  if (m === "K") return value * 1_000;
  return value;
}

function extractKeywordSnippet(text, { maxChars = 5000 } = {}) {
  const lines = String(text || "").split(/\r?\n/);
  const keywordLineIndexes = [];
  const keywordRe =
    /\b(coverage|limit|limits|liability|exclusion|exclusions|not covered|does not cover)\b/i;

  for (let i = 0; i < lines.length; i += 1) {
    if (keywordRe.test(lines[i])) keywordLineIndexes.push(i);
  }

  if (!keywordLineIndexes.length) {
    return String(text || "").slice(0, maxChars);
  }

  const ranges = keywordLineIndexes.map((idx) => ({
    start: Math.max(0, idx - 6),
    end: Math.min(lines.length - 1, idx + 8),
  }));

  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 1) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  return merged
    .map((range) => lines.slice(range.start, range.end + 1).join("\n"))
    .join("\n\n")
    .slice(0, maxChars);
}

async function extractPdfFieldsFromOcrResult(ocrResultOrText) {
  const text =
    typeof ocrResultOrText === "string"
      ? ocrResultOrText
      : typeof ocrResultOrText?.text === "string"
        ? ocrResultOrText.text
        : String(ocrResultOrText ?? "");

  const results = {};

  // Dates (expired and effective dates)
  let m;
  const dateRe = new RegExp(PATTERNS.date.source, "gi");

  while ((m = dateRe.exec(text)) !== null) {
    const context = text
      .slice(Math.max(0, m.index - 40), m.index)
      .toLowerCase();
    let label;
    if (/expiration|expiry|to\b|until|through/.test(context)) {
      label = "expiration_date";
    } else if (/effective|inception|from|policy/.test(context)) {
      label = "effective_date";
    } 
    if (label) {
      results[label] = normalizeDate(m[1]);
    }
  }

  // Policy number
  const policyMatch = text.match(PATTERNS.policy_number);
  results.policy_number = policyMatch ? policyMatch[1].trim() : null;

  // Premium
  const premiumRe = new RegExp(PATTERNS.premium.source, "gi");
  const premiumMatch = premiumRe.exec(text);
  if (premiumMatch) {
    results.total_premium = normalizeAmount(premiumMatch[1] ?? premiumMatch[2]);
  } else {
    results.total_premium = null;
  }
 
  //  Named insured 
  const insuredMatch = text.match(PATTERNS.named_insured);
  results.named_insured = insuredMatch ? insuredMatch[1].trim() : null;

  const llmSnippet = extractKeywordSnippet(text);
  try {
    const llmResult = await extractCoverageAndExclusionsWithGemini({
      snippet: llmSnippet,
    });

    if (llmResult.coverage_limits?.length) {
      results.coverage_limits = llmResult.coverage_limits;
    }
    if (llmResult.exclusions?.length) {
      results.exclusions = llmResult.exclusions;
    }

  } catch (err) {
    results.llm_failed = {
      reason: "llm_failed",
      snippet_length: llmSnippet.length,
      error: err.message,
    };
  }

  return results;
}

function validateExtraction(result) {
  const flags = [];

  if (!result.policy_number) {
    flags.push({ field: "policy_number", flag_type: "not_found" });
  }

  const dateMap = Object.fromEntries(
    (result.dates ?? []).map(({ label, value }) => [label, value]),
  );
  const eff = dateMap.effective_date;
  const exp = dateMap.expiration_date;
  if (eff && exp && eff >= exp) {
    flags.push({
      field: "dates",
      flag_type: "invalid_range",
      note: `effective ${eff} >= expiration ${exp}`,
    });
  }

  const premium = result.total_premium;
  if (premium !== null && premium !== undefined) {
    if (premium <= 0 || premium > 10_000_000) {
      flags.push({
        field: "total_premium",
        flag_type: "out_of_range",
        note: String(premium),
      });
    }
  } else {
    flags.push({ field: "total_premium", flag_type: "not_found" });
  }

  if (!result.named_insured) {
    flags.push({ field: "named_insured", flag_type: "not_found" });
  }

  return flags;
}

module.exports = {
  isPdfFile,
  extractPdfTextFromBuffer,
  extractPdfFieldsFromOcrResult,
};
