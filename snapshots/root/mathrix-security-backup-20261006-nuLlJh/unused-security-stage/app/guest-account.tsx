"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

export function GuestAccount({ room = "" }: { room?: string }) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState("");
  const suffix = room ? `&room=${encodeURIComponent(room)}` : "";
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
        <Link className="button" href={`/auth?signup=1${suffix}`}>
          Create account
        </Link>
        <Link href={room ? `/auth?room=${encodeURIComponent(room)}` : "/auth"}>
          Sign in
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
