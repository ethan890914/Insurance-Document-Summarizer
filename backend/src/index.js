const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const crypto = require('crypto');

const { ensureDb, insertPdfUpload, insertExtractedFields, sha256Hex } = require('./db');
const { isPdfFile, extractPdfTextFromBuffer, extractPdfFieldsFromOcrResult } = require('./pdf_utils');
const { generateSummaryWithGemini } = require('./llm_utils');
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Store uploads in-memory first, then persist to sqlite as a BLOB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
  },
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/pdf-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file in form field "file"' });
      return;
    }

    const { originalname, mimetype, size, buffer } = req.file;

    const isPdfType = isPdfFile({ originalname, mimetype });

    if (!isPdfType) {
      res.status(400).json({ error: 'Only PDF files are allowed' });
      return;
    }
    const pdfId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const ocrResult = await extractPdfTextFromBuffer(buffer, pdfId);
    const extractedFields = await extractPdfFieldsFromOcrResult(ocrResult);
    const summary = await generateSummaryWithGemini(extractedFields);
    insertPdfUpload({
      id: pdfId,
      filename: originalname,
      mimeType: mimetype || 'application/pdf',
      size,
      pdfKind: ocrResult.pdf_kind,
      extractionMethod: ocrResult.extraction_method,
      ocrText: ocrResult.text,
      data: buffer,
    });

    insertExtractedFields({
      id,
      pdfId,
      fields: extractedFields,
      summary,
    });

    res.status(200).json({
      id: pdfId,
      pdfKind: ocrResult.pdf_kind,
      textLength: (ocrResult.text || '').length,
      extractedFields,
      summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3002;

ensureDb();
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

