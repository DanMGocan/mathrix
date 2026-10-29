import type { Metadata } from "next";
import Link from "next/link";
import AdSense from "./ad-sense";
import "./style.css";
export const metadata: Metadata = {
  title: "MATHRIX — Think fast. Shift the matrix.",
  description:
    "A competitive 1v1 matrix game. Grow, sabotage, shield and race the clock.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdSense />
        <header className="nav">
          <Link className="brand" href="/">
            MATH<span>RIX</span>
            <i>▦</i>
          </Link>
          <nav>
            <Link href="/play">Play</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/how-to-play">How to play</Link>
            <Link href="/profile">Profile</Link>
            <Link href="/settings" aria-label="Settings">
              ⚙
            </Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <span>FAST · TACTICAL · A LITTLE CHAOTIC</span>
          <div>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/settings">Preferences</Link>
            <Link href="/admin">Admin</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
