const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SQLITE_PATH =
  process.env.SQLITE_PATH ||
  path.join(__dirname, '..', 'data', 'app.sqlite');

const DATA_DIR = path.dirname(SQLITE_PATH);

let db;

function ensureDb() {
  // Ensure the sqlite directory exists in case this repo is cloned fresh.
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (db) return db;

  db = new Database(SQLITE_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT,
      pdf_kind TEXT,
      extraction_method TEXT,
      ocr_text TEXT,
      created_at TEXT NOT NULL,
      data BLOB NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pdf_uploads_created_at
      ON pdf_uploads(created_at);
  `);

  // Lightweight migration path for existing databases created before OCR fields.
  const columns = db
    .prepare("PRAGMA table_info('pdf_uploads')")
    .all()
    .map((row) => row.name);

  if (!columns.includes('pdf_kind')) {
    db.exec('ALTER TABLE pdf_uploads ADD COLUMN pdf_kind TEXT');
  }
  if (!columns.includes('extraction_method')) {
    db.exec('ALTER TABLE pdf_uploads ADD COLUMN extraction_method TEXT');
  }
  if (!columns.includes('ocr_text')) {
    db.exec('ALTER TABLE pdf_uploads ADD COLUMN ocr_text TEXT');
  }

  return db;
}

function insertPdfUpload({
  id,
  filename,
  mimeType,
  size,
  sha256,
  pdfKind,
  extractionMethod,
  ocrText,
  data,
}) {
  const database = ensureDb();

  const stmt = database.prepare(`
    INSERT INTO pdf_uploads (
      id, filename, mime_type, size, sha256, pdf_kind, extraction_method, ocr_text, created_at, data
    )
    VALUES (
      @id, @filename, @mimeType, @size, @sha256, @pdfKind, @extractionMethod, @ocrText, @createdAt, @data
    )
  `);

  return stmt.run({
    id,
    filename,
    mimeType,
    size,
    sha256,
    pdfKind: pdfKind || null,
    extractionMethod: extractionMethod || null,
    ocrText: ocrText || null,
    createdAt: new Date().toISOString(),
    data,
  });
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  ensureDb,
  insertPdfUpload,
  sha256Hex,
};

