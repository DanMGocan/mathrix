"use client";
import Link from "next/link";
import { SessionStatus, useSession } from "@/lib/session";
import { GuestPlay } from "./guest-account";

export default function Landing() {
  const { me, loading } = useSession();
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
            <GuestPlay />
          </>
        )}
      </div>
    </section>
  );
}
