function extractJsonFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Continue and try to find fenced or embedded JSON.
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_) {
      // Continue to generic object match.
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_) {
      return null;
    }
  }

  return null;
}

async function extractCoverageAndExclusionsWithGemini({
  snippet,
}) {
  if (!process.env.GEMINI_API_KEY || !snippet?.trim()) {
    return {
      coverage_limits: [],
      exclusions: [],
      llm_used: false,
      reason: !process.env.GEMINI_API_KEY ? "missing_api_key" : "empty_snippet",
    };
  }

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const prompt = [
    "You are extracting insurance policy fields from OCR text.",
    "Return STRICT JSON only with this shape:",
    '{ "coverage_limits": string[], "exclusions": string[] }',
    "Rules:",
    "1) Keep each item short and specific.",
    "2) Do not invent values.",
    "3) If not found, return empty arrays.",
    "",
    "OCR snippet:",
    snippet,
  ].join("\n");
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const data = response.candidates[0].content.parts[0].text;
  const parsed = extractJsonFromText(data) || {};
  const coverage_limits = Array.isArray(parsed.coverage_limits)
    ? parsed.coverage_limits.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const exclusions = Array.isArray(parsed.exclusions)
    ? parsed.exclusions.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return { coverage_limits, exclusions, llm_used: true };
}

async function generateSummaryWithGemini(fields) {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  const prompt = [
    "You are an insurance analyst preparing a policy summary for a broker.",
    "",
    "Summarize the policy fields below into a SHORT structured paragraph of",
    "3-5 sentences. Follow these rules strictly:",
    "",
    "1. Use only the values provided in the fields below. Do not infer,",
    "   assume, or invent any value not explicitly present.",
    "2. Any field marked NOT FOUND must appear in your summary as 'not stated'.",
    "   Never omit a NOT FOUND field silently.",
    "3. Always follow this sentence order:",
    "   a) Named insured, and policy number.",
    "   b) Policy period and total premium.",
    "   c) Coverage type and key limits.",
    "   d) Notable exclusions or endorsements (if stated).",
    "4. Do not use bullet points, headers, or markdown. Plain prose only.",
    "5. Do not add commentary, opinions, or recommendations.",
    "",
    "Fields:",
    JSON.stringify(fields, null, 2),
  ].join("\n");
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.candidates[0].content.parts[0].text;
}

module.exports = {
  extractCoverageAndExclusionsWithGemini,
  generateSummaryWithGemini,
};
