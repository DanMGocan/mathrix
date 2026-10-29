import type { Metadata } from "next";
import Link from "next/link";
import AdSense from "./ad-sense";
import Navigation from "./navigation";
import FooterReports from "./footer-reports";
import { SessionProvider } from "@/lib/session";
import "./style.css";
export const metadata: Metadata = {
  title: "MATHRIX: Think fast. Shift the matrix.",
  description:
    "A competitive 1v1 matrix game. Grow, sabotage, shield and race the clock.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- The shared App Router layout loads this font on every page. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProvider>
          <AdSense />
          <div className="development-banner">Game in development.</div>
          <Navigation />
          <main>{children}</main>
          <footer>
            <div className="footer-links">
              <div className="footer-legal">
                <Link href="/privacy">Privacy Policy</Link>
                <Link href="/terms">Terms of Service</Link>
              </div>
              <div className="footer-social">
                <a
                  href="mailto:contact@mathrix.app"
                  aria-label="Contact Mathrix"
                  title="Email"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 6 9 7 9-7" />
                  </svg>
                </a>
                <a
                  href="https://www.reddit.com/r/mathrix/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Reddit"
                  title="Reddit"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <ellipse cx="12" cy="14" rx="8" ry="6" />
                    <path d="m12 8 1.5-5 4 1M4.7 10C1 7 0 13 4 13m15.3-3c3.7-3 4.7 3 .7 3M8.5 16.5c1.8 1.7 5.2 1.7 7 0" />
                    <circle cx="19" cy="4.5" r="1.8" />
                    <circle cx="8.5" cy="13" r="1" fill="currentColor" />
                    <circle cx="15.5" cy="13" r="1" fill="currentColor" />
                  </svg>
                </a>
                <a
                  href="https://discord.gg/y5x6RXMva8"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Discord"
                  title="Discord"
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
                </a>
                <FooterReports />
              </div>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
