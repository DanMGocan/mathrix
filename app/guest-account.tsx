"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useSession } from "@/lib/session";

export function GuestPlay({
  destination = "/play",
  className,
}: {
  destination?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const { refresh } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"create" | "restore" | null>(null);

  async function enter(restore: boolean) {
    if (busy) return;
    if (restore && !code.trim()) {
      setError("Enter your Guest profile code to continue.");
      return;
    }
    setBusy(restore ? "restore" : "create");
    setError("");
    try {
      await api(
        restore ? "/api/guest/restore" : "/api/guest",
        restore ? { code: code.trim() } : {},
      );
      await refresh();
      router.push(destination);
      dialog.current?.close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        disabled={!!busy}
        onClick={() => {
          setCode("");
          setError("");
          dialog.current?.showModal();
        }}
      >
        Play as guest
      </button>
      <dialog
        ref={dialog}
        className="tile-help-dialog guest-entry"
        aria-labelledby="guest-entry-title"
        aria-describedby="guest-entry-description"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <h2 id="guest-entry-title">Do you have a Guest profile code?</h2>
        <p id="guest-entry-description">
          Enter your code to continue your saved progress, or play without a
          code.
        </p>
        <form
          aria-busy={!!busy}
          onSubmit={(event) => {
            event.preventDefault();
            void enter(true);
          }}
        >
          <label>
            Guest profile code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              maxLength={128}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={!!busy}
              autoFocus
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button className="primary" type="submit" disabled={!!busy}>
              {busy === "restore" ? "Restoring…" : "Continue progress"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void enter(false)}
            >
              {busy === "create" ? "Entering…" : "Play without a code"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function GuestAccount({ room = "" }: { room?: string }) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<{ code: string }>("/api/guest/code")
      .then((r) => setCode(r.code))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <aside className="guest-account">
      <h2>Keep your guest progress</h2>
      <p>
        Your rank, stats and history are saved. Copy your private user code to
        play as this guest on another device. Anyone with the code can access
        this guest.
      </p>
      <details>
        <summary>Your guest user code</summary>
        <label>
          User code
          <input
            readOnly
            value={code}
            onFocus={(e) => e.target.select()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          disabled={!code}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage("User code copied.");
            } catch {
              setMessage("Select the user code above and copy it.");
            }
          }}
        >
          Copy user code
        </button>
      </details>
      {message && <p role="status">{message}</p>}
      <p>
        You can import this code once, only when creating a new account.
        Importing moves your progress to that account, removes this guest and
        invalidates its code. Existing accounts cannot import guests.
      </p>
      <div className="actions">
        <Link
          className="button"
          href={room ? `/auth?room=${encodeURIComponent(room)}` : "/auth"}
        >
          Continue with Google or Discord
        </Link>
      </div>
    </aside>
  );
}

export function GuestRestore({
  destination = "/play",
}: {
  destination?: string;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="guest-restore">
      <summary>Use guest code</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/api/guest/restore", { code });
            location.assign(destination);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          Guest user code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            maxLength={128}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <button disabled={busy}>{busy ? "Restoring…" : "Restore guest"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
