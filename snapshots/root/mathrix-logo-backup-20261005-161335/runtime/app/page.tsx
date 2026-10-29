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
      <h1 className="landing-logo" aria-label="Mathrix">
        <svg viewBox="0 0 640 320" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 230 42 265 76 20H372" strokeWidth="8" />
            <rect
              x="96"
              y="42"
              width="256"
              height="256"
              rx="6"
              strokeWidth="4"
            />
            <path d="M224 42V298M96 170H352" strokeWidth="4" />
          </g>
          <g textAnchor="middle" dominantBaseline="middle">
            <text x="160" y="106">
              M
            </text>
            <text x="288" y="106">
              T
            </text>
            <text x="160" y="234">
              H
            </text>
            <text x="288" y="234">
              X
            </text>
          </g>
          <text className="landing-logo-domain" x="364" y="290">
            .APP
          </text>
        </svg>
      </h1>
      <p className="landing-tagline">
        Competitive math game.
        <span>… this says all.</span>
      </p>
      <div className="actions landing-actions">
        {loading ? (
          <SessionStatus />
        ) : me?.registered ? (
          <>
            <Link className="button" href="/profile">
              Profile
            </Link>
            <Link className="button primary" href="/play">
              Play
            </Link>
          </>
        ) : (
          <>
            <Link className="button" href="/auth">
              Sign In
            </Link>
            <button className="primary" onClick={guest} disabled={busy}>
              {busy ? "Entering…" : "Play as Guest"}
            </button>
          </>
        )}
        <Link className="button" href="/how-to-play">
          How to Play
        </Link>
      </div>
      {error && (
        <p className="landing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
