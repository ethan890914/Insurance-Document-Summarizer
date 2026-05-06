import React, { useCallback, useEffect, useMemo, useState } from "react";

type UploadResponse = {
  id: string;
};

type ExtractResponse = {
  pdfId: string;
  extractedFields: Record<string, unknown>;
  summary: string | null;
};

type ProcessedListItem = {
  id: string;
  filename: string;
  uploadedAt: string;
};

type ExtractedDetail = {
  id: string;
  pdfId: string;
  filename: string;
  uploadedAt: string;
  processedAt: string;
  summary: string | null;
  extractedFields: Record<string, unknown>;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3002";

type Tab = "upload" | "processed";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<
    "upload" | "extract" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(
    null,
  );

  const [processedItems, setProcessedItems] = useState<ProcessedListItem[]>([]);
  const [processedLoading, setProcessedLoading] = useState(true);
  const [processedError, setProcessedError] = useState<string | null>(null);

  const [detail, setDetail] = useState<ExtractedDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  const fetchProcessedList = useCallback(async () => {
    setProcessedError(null);
    setProcessedLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/documents`);
      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(msg || `List failed with status ${resp.status}`);
      }
      const data = (await resp.json()) as { items: ProcessedListItem[] };
      setProcessedItems(data.items ?? []);
    } catch (err) {
      setProcessedError(
        err instanceof Error
          ? err.message
          : "Failed to load processed documents",
      );
    } finally {
      setProcessedLoading(false);
    }
  }, []);

  const loadExtractDetail = useCallback(async (id: string) => {
    setDetailError(null);
    setDetail(null);
    setDetailLoadingId(id);
    try {
      const resp = await fetch(
        `${BACKEND_URL}/api/extracted-fields/${encodeURIComponent(id)}`,
      );
      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(msg || `Load failed with status ${resp.status}`);
      }
      const data = (await resp.json()) as ExtractedDetail;
      setDetail(data);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Failed to load document details",
      );
    } finally {
      setDetailLoadingId(null);
    }
  }, []);

  useEffect(() => {
    void fetchProcessedList();
  }, [fetchProcessedList]);

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
        throw new Error(
          msg || `Upload failed with status ${uploadResp.status}`,
        );
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
      void fetchProcessedList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
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

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  };

  const cellStyle: React.CSSProperties = {
    borderBottom: "1px solid #e0e0e0",
    padding: "8px 6px",
    textAlign: "left",
    verticalAlign: "middle",
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "48px auto",
      }}
    >
      <h1 style={{ marginBottom: 12 }}>Insurance Document Summarizer</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Select an insurance policy file and upload.
      </p>

      {/* Tab buttons */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #e0e0e0",
          marginBottom: 24,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          style={{
            padding: "8px 20px",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "upload"
                ? "2px solid #000"
                : "2px solid transparent",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            fontWeight: activeTab === "upload" ? 600 : 400,
            color: activeTab === "upload" ? "#000" : "#666",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          Upload Document
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("processed")}
          style={{
            padding: "8px 20px",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "processed"
                ? "2px solid #000"
                : "2px solid transparent",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            fontWeight: activeTab === "processed" ? 600 : 400,
            color: activeTab === "processed" ? "#000" : "#666",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          Processed Documents
        </button>
      </div>

      {/* Upload tab */}
      {activeTab === "upload" && (
        <>
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
              <p
                style={{ marginTop: 0, whiteSpace: "pre-wrap", color: "#222" }}
              >
                {extractResult.summary || "(none)"}
              </p>
              <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>
                Extracted fields
              </h2>
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
        </>
      )}

      {/* Processed tab */}
      {activeTab === "processed" && (
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h2 style={{ fontSize: "1.15rem", margin: 0 }}>
              Processed documents
            </h2>
          </div>
          <p style={{ marginTop: 0, color: "#555", fontSize: 14 }}>
            PDF name and upload time. Use View to load summary and fields from
            the server.
          </p>

          {processedError ? (
            <div style={{ color: "#b00020" }}>
              <strong>Error:</strong> {processedError}
            </div>
          ) : null}

          {processedLoading && processedItems.length === 0 ? (
            <div style={{ color: "#666" }}>Loading…</div>
          ) : null}

          {!processedLoading &&
          processedItems.length === 0 &&
          !processedError ? (
            <div style={{ color: "#666" }}>No processed documents yet.</div>
          ) : null}

          {processedItems.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ color: "#333" }}>
                    <th
                      style={{ ...cellStyle, borderBottom: "2px solid #ccc" }}
                    >
                      PDF name
                    </th>
                    <th
                      style={{ ...cellStyle, borderBottom: "2px solid #ccc" }}
                    >
                      Uploaded
                    </th>
                    <th
                      style={{
                        ...cellStyle,
                        borderBottom: "2px solid #ccc",
                        width: 100,
                      }}
                    >
                      {" "}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {processedItems.map((row) => (
                    <tr key={row.id}>
                      <td style={cellStyle}>{row.filename}</td>
                      <td style={cellStyle}>
                        {row.uploadedAt
                          ? new Date(row.uploadedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td style={cellStyle}>
                        <button
                          type="button"
                          onClick={() => void loadExtractDetail(row.id)}
                          disabled={detailLoadingId === row.id}
                          style={{ padding: "6px 12px" }}
                        >
                          {detailLoadingId === row.id ? "Loading…" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {detailError ? (
            <div style={{ marginTop: 16, color: "#b00020" }}>
              <strong>Detail error:</strong> {detailError}
            </div>
          ) : null}

          {detail ? (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                background: "#f8f9fa",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: "1rem" }}>
                {detail.filename}
              </h3>
              <p style={{ marginTop: 0, fontSize: 13, color: "#555" }}>
                Uploaded:{" "}
                {detail.uploadedAt
                  ? new Date(detail.uploadedAt).toLocaleString()
                  : "—"}
                {" · "}
                Processed:{" "}
                {detail.processedAt
                  ? new Date(detail.processedAt).toLocaleString()
                  : "—"}
              </p>
              <h4 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Summary</h4>
              <p
                style={{ marginTop: 0, whiteSpace: "pre-wrap", color: "#222" }}
              >
                {detail.summary || "(no summary)"}
              </p>
              <h4 style={{ fontSize: "0.95rem", marginBottom: 8 }}>
                Extracted fields
              </h4>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: "#fff",
                  borderRadius: 6,
                  overflow: "auto",
                  fontSize: 13,
                  border: "1px solid #eee",
                }}
              >
                {JSON.stringify(detail.extractedFields, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
