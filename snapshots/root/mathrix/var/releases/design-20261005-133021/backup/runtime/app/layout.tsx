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
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/settings">Preferences</Link>
              <a
                href="https://discord.gg/y5x6RXMva8"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515c-.211.375-.457.88-.626 1.281a18.416 18.416 0 0 0-5.414 0 12.64 12.64 0 0 0-.634-1.281A19.736 19.736 0 0 0 3.87 4.373C.779 8.945-.059 13.403.36 17.798a19.9 19.9 0 0 0 5.993 3.03c.486-.661.92-1.36 1.293-2.096a12.92 12.92 0 0 1-2.037-.988c.171-.124.338-.253.5-.386 3.928 1.818 8.196 1.818 12.077 0 .164.133.331.262.5.386-.647.388-1.33.72-2.04.99.375.735.806 1.437 1.294 2.096a19.839 19.839 0 0 0 5.996-3.032c.491-5.095-.838-9.512-3.62-13.428ZM8.02 15.108c-1.18 0-2.148-1.077-2.148-2.388 0-1.311.948-2.39 2.148-2.39 1.2 0 2.168 1.078 2.148 2.39.002 1.311-.948 2.388-2.148 2.388Zm7.937 0c-1.18 0-2.148-1.077-2.148-2.388 0-1.311.948-2.39 2.148-2.39 1.2 0 2.168 1.078 2.148 2.39 0 1.311-.948 2.388-2.148 2.388Z" />
                </svg>
                Discord
              </a>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
