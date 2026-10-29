"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

export default function FooterReports() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"bug" | "feedback" | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (kind) dialog.current?.showModal();
    else dialog.current?.close();
  }, [kind]);

  function open(next: "bug" | "feedback") {
    setError("");
    setSent(false);
    setKind(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    const message = String(data.get("message") || "").trim();
    if (!title || !message) {
      setError("Enter a title and message before sending.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await api(kind === "bug" ? "/api/bug-reports" : "/api/feedback", {
        title,
        message,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Report a bug"
        title="Report a bug"
        aria-haspopup="dialog"
        onClick={() => open("bug")}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 4-2-2m8 2 2-2M8 8V7a4 4 0 0 1 8 0v1M6 12H3m3 4H3m15-4h3m-3 4h3M6 9 3 6m15 3 3-3" />
          <rect x="6" y="8" width="12" height="13" rx="6" />
          <path d="M12 8v13" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Send feedback"
        title="Send feedback"
        aria-haspopup="dialog"
        onClick={() => open("feedback")}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 0 1 0-4 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="tile-help-dialog report-dialog"
        aria-labelledby="report-heading"
        onClose={() => setKind(null)}
        onCancel={(event) => {
          if (sending) event.preventDefault();
        }}
      >
        {kind && (
          <>
            <h2 id="report-heading">
              {kind === "bug" ? "Report a bug" : "Send feedback"}
            </h2>
            {sent ? (
              <>
                <p role="status">
                  Thanks! Your {kind === "bug" ? "bug report" : "feedback"} has
                  been saved.
                </p>
                <button autoFocus onClick={() => dialog.current?.close()}>
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={submit} aria-busy={sending}>
                <fieldset disabled={sending}>
                  <label>
                    Title
                    <input name="title" required maxLength={200} autoFocus />
                  </label>
                  <label>
                    Message
                    <textarea
                      name="message"
                      required
                      maxLength={10000}
                      rows={6}
                    />
                  </label>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="report-actions">
                    <button
                      type="button"
                      onClick={() => dialog.current?.close()}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary">
                      {sending
                        ? "Sending…"
                        : kind === "bug"
                          ? "Send bug report"
                          : "Send feedback"}
                    </button>
                  </p>
                </fieldset>
              </form>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
