"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { DesignFile } from "@/server/design-files";

export default function DesignFiles() {
  const [files, setFiles] = useState<DesignFile[] | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => {
    try {
      setFiles(await api<DesignFile[]>("/api/admin/design-files"));
    } catch (error) {
      setMessage(`Could not refresh files: ${(error as Error).message}`);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    const form = event.currentTarget,
      data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
      setMessage("Choose a nonempty file up to 10 MiB.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/design-files", {
        method: "POST",
        credentials: "include",
        body: data,
      });
      const result = await response
        .json()
        .catch(() => ({ error: "Upload failed. Please try again." }));
      if (!response.ok)
        throw Error(result.error || "Upload failed. Please try again.");
      setFiles((current) => [result as DesignFile, ...(current || [])]);
      form.reset();
      setMessage(
        `Uploaded ${result.filename}. You can now refer to this filename in your design instructions.`,
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <h2>Design files</h2>
      <p>
        Upload a design reference, then tell the AI its filename and what you
        want implemented. Uploading only saves the file.
      </p>
      <form className="panel" onSubmit={upload}>
        <label>
          Design file
          <input
            type="file"
            name="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf"
            required
            disabled={uploading}
            aria-describedby="design-file-help"
          />
        </label>
        <p id="design-file-help">
          PNG, JPEG, WebP, GIF, or PDF · Maximum 10 MiB · Each filename must be
          unique.
        </p>
        <label>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            required
            disabled={uploading}
            placeholder="Describe what this design shows"
          />
        </label>
        <button className="primary" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload file"}
        </button>
      </form>
      <div className="admin-tools">
        <button onClick={() => void load()} disabled={uploading}>
          Refresh files
        </button>
        <span role="status">{message}</span>
      </div>
      {files === null ? (
        message ? null : (
          <p>Loading files…</p>
        )
      ) : files.length === 0 ? (
        <p>No design files uploaded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Description</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.filename}>
                  <th scope="row">{file.filename}</th>
                  <td
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {file.description}
                  </td>
                  <td>
                    {file.size < 1024 * 1024
                      ? `${Math.max(1, Math.ceil(file.size / 1024))} KiB`
                      : `${(file.size / (1024 * 1024)).toFixed(1)} MiB`}
                  </td>
                  <td>{new Date(file.createdAt).toLocaleString()}</td>
                  <td>
                    <a
                      href={`/api/admin/design-files/download?filename=${encodeURIComponent(file.filename)}`}
                      download={file.filename}
                      aria-label={`Download ${file.filename}`}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
