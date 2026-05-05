const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const crypto = require('crypto');

const {
  ensureDb,
  insertPdfUpload,
  insertExtractedFields,
  getPdfUploadById,
} = require('./db');
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
    const ocrResult = await extractPdfTextFromBuffer(buffer, pdfId);
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

    res.status(200).json({ id: pdfId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

app.post('/api/pdf-extract-fields', async (req, res) => {
  try {
    const pdfId = req.body.pdfId

    if (!pdfId) {
      res.status(400).json({ error: 'Missing pdfId in JSON body' });
      return;
    }

    const row = getPdfUploadById(pdfId);
    if (!row) {
      res.status(404).json({ error: 'PDF not found' });
      return;
    }

    const ocrText = row.ocrText || '';
    const extractedFields = await extractPdfFieldsFromOcrResult(ocrText);
    const summary = await generateSummaryWithGemini(extractedFields);

    const fieldsRowId = crypto.randomUUID();
    insertExtractedFields({
      id: fieldsRowId,
      pdfId,
      fields: extractedFields,
      summary,
    });

    res.status(200).json({
      pdfId,
      extractedFields,
      summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Field extraction failed: ${err.message}` });
  }
});

port = 3002

ensureDb();
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

