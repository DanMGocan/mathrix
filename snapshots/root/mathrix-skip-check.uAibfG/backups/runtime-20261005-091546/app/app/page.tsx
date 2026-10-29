"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
export default function Landing() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function guest() {
    try {
      await api("/api/guest", {});
      router.push("/play");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="landing">
      <div className="hero">
        <div className="eyebrow">01 / THE MATRIX IS YOURS TO CHANGE</div>
        <h1>
          Think fast.
          <br />
          <span>Shift the matrix.</span>
        </h1>
        <p>
          Two players. Eight cards. A clock you can change.
          <br />
          Make your numbers bigger. Make theirs a problem.
        </p>
        <div className="actions">
          <button className="primary" onClick={guest}>
            Play as guest <span>↗</span>
          </button>
          <Link className="button" href="/auth">
            Sign in / Create account
          </Link>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="micro">NO DOWNLOADS · NO ACCOUNT NEEDED</div>
      </div>
      <div className="hero-art" aria-label="Matrix game illustration">
        <div className="art-caption">
          <span>YOUR MATRIX</span>
          <b>Σ 24</b>
        </div>
        <div className="art-grid">
          {[3, 8, 5, 8].map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
        <div className="floating-card">
          <small>EITHER / CELL</small>
          <strong>×2</strong>
          <span>DOUBLE DOWN</span>
        </div>
        <div className="orbit">+ − × Σ</div>
      </div>
      <div className="features">
        <article>
          <span>01</span>
          <h3>Build your advantage</h3>
          <p>
            Add rows and columns. Hit the reflex targets to stack their value.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>Break their strategy</h3>
          <p>
            Negate a row, remove a column, or turn their best cell against them.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Own the final sum</h3>
          <p>
            The higher signed sum wins. Negative numbers hurt. Every second
            counts.
          </p>
        </article>
      </div>
    </div>
  );
}
