import { cookies } from "next/headers";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  try {
    const res = await fetch(
      `${process.env.GAME_INTERNAL_URL || "http://127.0.0.1:3001"}/api/me`,
      { headers: { cookie: jar.toString() }, cache: "no-store" },
    );
    const p = await res.json();
    if (p?.role === "ADMIN") return children;
  } catch {}
  return (
    <section className="narrow">
      <h1>Administrator access required</h1>
      <p>Sign in with an administrator account to use this dashboard.</p>
      <Link className="button" href="/auth">
        Sign in
      </Link>
    </section>
  );
}
