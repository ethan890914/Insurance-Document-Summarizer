const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const crypto = require('crypto');

const { ensureDb, insertPdfUpload, sha256Hex } = require('./db');
const { isPdfFile, extractPdfTextFromBuffer } = require('./pdf_utils');

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

    const id = crypto.randomUUID();
    const sha256 = sha256Hex(buffer);
    const ocrResult = await extractPdfTextFromBuffer(buffer, id);

    insertPdfUpload({
      id,
      filename: originalname,
      mimeType: mimetype || 'application/pdf',
      size,
      sha256,
      pdfKind: ocrResult.pdf_kind,
      extractionMethod: ocrResult.extraction_method,
      ocrText: ocrResult.text,
      data: buffer,
    });

    res.status(200).json({
      id,
      pdfKind: ocrResult.pdf_kind,
      extractionMethod: ocrResult.extraction_method,
      textLength: (ocrResult.text || '').length,
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

