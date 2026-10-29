"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { SessionStatus, useSession } from "@/lib/session";

export default function Landing() {
  const router = useRouter();
  const { me, loading, refresh } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function guest() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/guest", {});
      await refresh();
      router.push("/play");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="landing">
      <div className="landing-symbols" aria-hidden="true">
        {[
          ["+", 9, 18],
          ["π", 28, 9],
          ["÷", 54, 12],
          ["√", 81, 17],
          ["×", 93, 34],
          ["=", 7, 48],
          ["Σ", 23, 66],
          ["∞", 78, 59],
          ["−", 92, 78],
          ["∫", 13, 86],
          ["±", 49, 88],
          ["≠", 79, 85],
        ].map(([symbol, left, top], index) => (
          <span
            key={symbol}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${index * -2}s`,
            }}
          >
            {symbol}
          </span>
        ))}
      </div>
      <h1 className="landing-logo" aria-label="Mathrix">
        <img src="/logo_digital.png" alt="Mathrix" width={1445} height={1089} />
      </h1>
      <div className="landing-actions">
        {loading ? (
          <SessionStatus />
        ) : me?.registered ? (
          <>
            <Link href="/profile">Profile</Link>
            <Link href="/play">Play</Link>
          </>
        ) : (
          <>
            <Link href="/auth">Sign up / Sign in</Link>
            <button onClick={guest} disabled={busy}>
              {busy ? "Entering…" : "Play as guest"}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="landing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
