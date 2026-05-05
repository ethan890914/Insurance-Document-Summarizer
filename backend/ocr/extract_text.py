#!/usr/bin/env python3
import argparse
import json
import sys

import pdfplumber


def detect_pdf_kind(pdf_path: str, sample_pages: int = 3, min_chars: int = 20) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        pages_to_scan = min(sample_pages, total_pages)
        chars = 0
        for i in range(pages_to_scan):
            text = pdf.pages[i].extract_text() or ""
            chars += len(text.strip())
            if chars >= min_chars:
                return "native"
    return "scanned"


def extract_native_text(pdf_path: str) -> str:
    chunks = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                chunks.append(page_text)
    return "\n\n".join(chunks).strip()


def extract_scanned_text(pdf_path: str) -> str:
    from pdf2image import convert_from_path
    import pytesseract

    images = convert_from_path(pdf_path, dpi=300)
    chunks = []
    for image in images:
        text = pytesseract.image_to_string(image) or ""
        if text.strip():
            chunks.append(text)
    return "\n\n".join(chunks).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()

    try:
      kind = detect_pdf_kind(args.pdf)

      if kind == "native":
          text = extract_native_text(args.pdf)
          method = "pdfplumber"
      else:
          text = extract_scanned_text(args.pdf)
          method = "pdf2image+tesseract"

      print(
          json.dumps(
              {
                  "ok": True,
                  "pdf_kind": kind,
                  "extraction_method": method,
                  "text": text,
              }
          )
      )
      return 0
    except Exception as exc:
      print(
          json.dumps(
              {
                  "ok": False,
                  "error": str(exc),
              }
          )
      )
      return 1


if __name__ == "__main__":
    sys.exit(main())

