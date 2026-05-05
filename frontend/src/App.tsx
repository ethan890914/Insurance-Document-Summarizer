import React, { useMemo, useState } from "react";

type UploadResponse = {
  id: string;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3002";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`${BACKEND_URL}/api/pdf-upload`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(msg || `Upload failed with status ${resp.status}`);
      }

      const data = (await resp.json()) as UploadResponse;
      setUploadedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 680,
        margin: "48px auto",
      }}
    >
      <h1 style={{ marginBottom: 12 }}>Upload PDF</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Select a PDF file. The backend will store it in a SQLite database (as a
        BLOB).
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
          disabled={isUploading}
          style={{ padding: "10px 14px" }}
        >
          {isUploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error ? (
        <div style={{ marginTop: 16, color: "#b00020" }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {uploadedId ? (
        <div style={{ marginTop: 16, color: "#0b6b1f" }}>
          <strong>Uploaded:</strong> {uploadedId}
        </div>
      ) : null}
    </div>
  );
}
