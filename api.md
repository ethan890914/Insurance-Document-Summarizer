# API Doc

## GET `/api/documents`

### Description

List summarized documents

### Request Format

- Method: GET

### Response Format

#### 200 OK

```json
{
  "items": [
    {
      "id": "string",
      "pdfId": "string",
      "summary": "string",
      "createdAt": "string"
    }
  ]
}
```

#### 500 Internal Server Error

```json
{ "error": "List failed: error message" }
```

---

## GET `/api/extracted-fields/:id`

### Description

Fetch extracted fields by document ID.

### Request Format

- Method: GET
- Path Params:
  - `id` (string, required)

### Response Format

#### 200 OK

```json
{
  "id": "string",
  "pdfId": "string",
  "fields": {},
  "summary": "string",
  "createdAt": "string"
}
```

#### 404 Not Found

```json
{ "error": "Not found" }
```

#### 500 Internal Server Error

```json
{ "error": "Load failed: error message" }
```

---

## POST `/api/pdf-upload`

### Description

Upload a PDF file and run OCR extraction.

### Request Format

- Method: POST
- Content-Type: `multipart/form-data`
- Body:
  - `file` (PDF file, required)

### Response Format

#### 200 OK

```json
{
  "id": "string"
}
```

#### 400 Bad Request

```json
{ "error": "Missing file in form field \"file\"" }
```

```json
{ "error": "Only PDF files are allowed" }
```

#### 500 Internal Server Error

```json
{ "error": "Upload failed: error message" }
```

---

## POST `/api/pdf-extract-fields`

### Description

Extract structured fields and generate summary from uploaded PDF.

### Request Format

- Method: POST
- Content-Type: `application/json`
- Body:

```json
{
  "pdfId": "string"
}
```

### Response Format

#### 200 OK

```json
{
  "pdfId": "string",
  "extractedFields": {},
  "summary": "string"
}
```

#### 400 Bad Request

```json
{ "error": "Missing pdfId in JSON body" }
```

#### 404 Not Found

```json
{ "error": "PDF not found" }
```

#### 500 Internal Server Error

```json
{ "error": "Field extraction failed: error message" }
```
