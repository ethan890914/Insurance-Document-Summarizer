const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function isPdfFile({ originalname, mimetype }) {
  return mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
}

function runPythonOcr(pdfPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'ocr', 'extract_text.py');
    const pythonCmd = process.env.PYTHON_BIN || 'python3';
    const child = spawn(pythonCmd, [scriptPath, '--pdf', pdfPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      let parsed;
      try {
        parsed = JSON.parse(stdout || '{}');
      } catch (err) {
        reject(new Error(`Invalid OCR JSON output. stderr=${stderr}`));
        return;
      }

      if (code !== 0 || !parsed.ok) {
        reject(
          new Error(
            `OCR extraction failed. code=${code}; error=${parsed.error || stderr || 'unknown'}`,
          ),
        );
        return;
      }

      resolve(parsed);
    });
  });
}

async function extractPdfTextFromBuffer(buffer, id) {
  const tempPdfPath = path.join(os.tmpdir(), `pdf-upload-${id}.pdf`);
  fs.writeFileSync(tempPdfPath, buffer);

  try {
    return await runPythonOcr(tempPdfPath);
  } finally {
    fs.rmSync(tempPdfPath, { force: true });
  }
}

module.exports = {
  isPdfFile,
  extractPdfTextFromBuffer,
};

