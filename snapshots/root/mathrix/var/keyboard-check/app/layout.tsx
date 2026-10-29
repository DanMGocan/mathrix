import type { Metadata } from "next";
import Link from "next/link";
import AdSense from "./ad-sense";
import Navigation from "./navigation";
import { SessionProvider } from "@/lib/session";
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
        <SessionProvider>
          <AdSense />
          <Navigation />
          <main>{children}</main>
          <footer>
            <span>FAST · TACTICAL · A LITTLE CHAOTIC</span>
            <div>
              <Link href="/privacy">Privacy</Link>
              <Link href="/settings">Preferences</Link>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
