const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

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

    CREATE TABLE IF NOT EXISTS extracted_fields (
      id TEXT PRIMARY KEY,
      pdf_id TEXT NOT NULL,
      effective_date TEXT,
      expiration_date TEXT,
      policy_number TEXT,
      total_premium REAL,
      named_insured TEXT,
      coverage_limits TEXT,
      exclusions TEXT,
      summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (pdf_id) REFERENCES pdf_uploads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pdf_uploads_created_at
      ON pdf_uploads(created_at);

    CREATE INDEX IF NOT EXISTS idx_extracted_fields_pdf_id
      ON extracted_fields(pdf_id);
  `);

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

function insertExtractedFields({
  id,
  pdfId,
  fields,
  summary,
}) {
  const database = ensureDb();
  const {
    effective_date,
    expiration_date,
    policy_number,
    total_premium,
    named_insured,
    coverage_limits,
    exclusions,
  } = fields || {};
  const stmt = database.prepare(`
    INSERT INTO extracted_fields (
      id,
      pdf_id,
      effective_date,
      expiration_date,
      policy_number,
      total_premium,
      named_insured,
      coverage_limits,
      exclusions,
      summary,
      created_at
    ) VALUES (
      @id,
      @pdfId,
      @effectiveDate,
      @expirationDate,
      @policyNumber,
      @totalPremium,
      @namedInsured,
      @coverageLimits,
      @exclusions,
      @summary,
      @createdAt
    )
  `);
  return stmt.run({
    id,
    pdfId,
    effectiveDate: effective_date || null,
    expirationDate: expiration_date || null,
    policyNumber: policy_number || null,
    totalPremium:
      typeof total_premium === 'number' ? total_premium : null,
    namedInsured: named_insured || null,
    coverageLimits: Array.isArray(coverage_limits)
      ? JSON.stringify(coverage_limits)
      : coverage_limits
        ? JSON.stringify([String(coverage_limits)])
        : null,
    exclusions: Array.isArray(exclusions)
      ? JSON.stringify(exclusions)
      : exclusions
        ? JSON.stringify([String(exclusions)])
        : null,
    summary: summary || null,
    createdAt: new Date().toISOString(),
  });
}

function getPdfUploadById(id) {
  const database = ensureDb();
  const row = database
    .prepare(
      `
    SELECT id, ocr_text AS ocrText, pdf_kind AS pdfKind
    FROM pdf_uploads
    WHERE id = ?
  `,
    )
    .get(id);
  return row || null;
}

function parseStoredJson(value) {
  if (value == null || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function listExtractedFieldsSummary({ limit = 100 } = {}) {
  const database = ensureDb();
  const cap = Math.min(500, Math.max(1, Number(limit) || 100));
  const rows = database
    .prepare(
      `
    SELECT
      ef.id AS id,
      u.filename AS filename,
      u.created_at AS uploaded_at
    FROM extracted_fields ef
    INNER JOIN pdf_uploads u ON u.id = ef.pdf_id
    ORDER BY datetime(u.created_at) DESC
    LIMIT ?
  `,
    )
    .all(cap);

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    uploadedAt: r.uploaded_at,
  }));
}

function getExtractedFieldsById(extractedFieldsId) {
  const database = ensureDb();
  const r = database
    .prepare(
      `
    SELECT
      ef.id,
      ef.pdf_id,
      ef.effective_date,
      ef.expiration_date,
      ef.policy_number,
      ef.total_premium,
      ef.named_insured,
      ef.coverage_limits,
      ef.exclusions,
      ef.summary,
      ef.created_at AS processed_at,
      u.filename,
      u.created_at AS uploaded_at
    FROM extracted_fields ef
    INNER JOIN pdf_uploads u ON u.id = ef.pdf_id
    WHERE ef.id = ?
  `,
    )
    .get(extractedFieldsId);

  if (!r) return null;

  return {
    id: r.id,
    pdfId: r.pdf_id,
    filename: r.filename,
    uploadedAt: r.uploaded_at,
    processedAt: r.processed_at,
    summary: r.summary,
    extractedFields: {
      effective_date: r.effective_date,
      expiration_date: r.expiration_date,
      policy_number: r.policy_number,
      total_premium: r.total_premium,
      named_insured: r.named_insured,
      coverage_limits: parseStoredJson(r.coverage_limits),
      exclusions: parseStoredJson(r.exclusions),
    },
  };
}

module.exports = {
  ensureDb,
  insertPdfUpload,
  insertExtractedFields,
  getPdfUploadById,
  listExtractedFieldsSummary,
  getExtractedFieldsById,
};

