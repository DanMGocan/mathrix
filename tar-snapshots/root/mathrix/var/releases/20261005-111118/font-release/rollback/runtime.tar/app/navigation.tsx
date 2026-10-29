"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SessionStatus, useSession } from "@/lib/session";

export default function Navigation() {
  const { me, loading, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="nav">
      <Link className="brand" href="/">
        MATH<span>RIX</span>
        <i>▦</i>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/play">Play</Link>
        <Link className="nav-secondary" href="/leaderboard">
          Leaderboard
        </Link>
        <Link className="nav-secondary" href="/how-to-play">
          How to play
        </Link>
        {loading ? (
          <SessionStatus />
        ) : me?.registered ? (
          <details
            className="account-menu"
            key={`${pathname}:${me.id}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.currentTarget.open = false;
                e.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label={`Account: ${me.name}`}>{me.name}</summary>
            <div className="account-links">
              <Link href="/profile">Profile</Link>
              <Link href="/settings">Preferences</Link>
              {me.role === "ADMIN" && <Link href="/admin">Admin</Link>}
              <button onClick={logout} disabled={busy}>
                {busy ? "Signing out…" : "Sign out"}
              </button>
              {error && <p role="alert">{error}</p>}
            </div>
          </details>
        ) : (
          <>
            {me && <Link href="/profile">Guest profile</Link>}
            <Link href="/auth">Sign in</Link>
            <Link href="/settings" aria-label="Settings">
              ⚙
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
