import Link from "next/link";
import { isAdministrator } from "@/lib/admin-access";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isAdministrator()) return children;
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
