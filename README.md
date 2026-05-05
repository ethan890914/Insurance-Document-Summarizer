# Insurance-Document-Summarizer

## Quick PDF Upload (end-to-end)

This is a minimal end-to-end system:

- `frontend/`: React app to upload a PDF
- `backend/`: Express API that receives the upload, runs text extraction, and stores everything in SQLite

### Run

1. Install frontend deps:
   - `npm --prefix ./frontend install`
2. Install backend deps:
   - `npm --prefix ./backend install`
   - `python3 -m pip install -r ./backend/requirements.txt`
   - Make sure system binaries are installed:
     - `tesseract`
     - `poppler` (required by `pdf2image`)
3. Start backend:
   - `npm --prefix ./backend run dev` (listens on `http://localhost:3002`)
4. Start frontend:
   - `npm --prefix ./frontend run dev` (Vite on `http://localhost:5173`)

### API

- `POST /api/pdf-upload`
  - `multipart/form-data` with field name `file`
  - Processing:
    1. detect native vs scanned PDF
    2. native: `pdfplumber`
    3. scanned: `pdf2image + pytesseract`
    4. save extracted text in SQLite
  - Response includes:
    - `id`
    - `pdfKind`
    - `extractionMethod`
    - `textLength`
