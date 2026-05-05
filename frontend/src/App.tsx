import React, { useMemo, useState } from "react";

type UploadResponse = {
  id: string;
};

type ExtractResponse = {
  pdfId: string;
  extractedFields: Record<string, unknown>;
  summary: string | null;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3002";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<"upload" | "extract" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(
    null,
  );

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExtractError(null);
    setExtractResult(null);
    setUploadedId(null);

    if (!file) {
      setError("Please choose a PDF file first.");
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files are allowed.");
      return;
    }

    let uploadSucceeded = false;

    setIsProcessing(true);
    setProcessingStep("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResp = await fetch(`${BACKEND_URL}/api/pdf-upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        const msg = await uploadResp.text().catch(() => "");
        throw new Error(msg || `Upload failed with status ${uploadResp.status}`);
      }

      const uploadData = (await uploadResp.json()) as UploadResponse;
      setUploadedId(uploadData.id);
      uploadSucceeded = true;

      setProcessingStep("extract");

      const extractResp = await fetch(`${BACKEND_URL}/api/pdf-extract-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfId: uploadData.id }),
      });

      if (!extractResp.ok) {
        const msg = await extractResp.text().catch(() => "");
        throw new Error(
          msg || `Extraction failed with status ${extractResp.status}`,
        );
      }

      const extractData = (await extractResp.json()) as ExtractResponse;
      setExtractResult(extractData);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Request failed";
      if (uploadSucceeded) {
        setExtractError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsProcessing(false);
      setProcessingStep(null);
    }
  }

  const submitLabel =
    processingStep === "extract"
      ? "Extracting…"
      : processingStep === "upload"
        ? "Uploading…"
        : "Upload";

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 680,
        margin: "48px auto",
      }}
    >
      <h1 style={{ marginBottom: 12 }}>Insurance Document Summarizer</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Select an insurance policy file and upload.
      </p>

      <form onSubmit={onUpload} style={{ display: "grid", gap: 12 }}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
          }}
        />

        {fileSummary ? (
          <div style={{ color: "#333" }}>{fileSummary}</div>
        ) : null}

        <button
          type="submit"
          disabled={isProcessing}
          style={{ padding: "10px 14px" }}
        >
          {submitLabel}
        </button>
      </form>

      {error ? (
        <div style={{ marginTop: 16, color: "#b00020" }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {processingStep === "extract" ? (
        <div style={{ marginTop: 16, color: "#333" }}>
          Extracting fields and generating summary…
        </div>
      ) : null}

      {extractError ? (
        <div style={{ marginTop: 16, color: "#b00020" }}>
          <strong>Extraction error:</strong> {extractError}
        </div>
      ) : null}

      {extractResult ? (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Summary</h2>
          <p style={{ marginTop: 0, whiteSpace: "pre-wrap", color: "#222" }}>
            {extractResult.summary || "(none)"}
          </p>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Extracted fields</h2>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: "#f5f5f5",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
            }}
          >
            {JSON.stringify(extractResult.extractedFields, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
