import { readFile } from "node:fs/promises";
import Link from "next/link";
import { isAdministrator } from "@/lib/admin-access";
export default async function Docs() {
  if (!(await isAdministrator())) return null;
  const rules = await readFile(process.cwd() + "/GAME_RULES.md", "utf8");
  return (
    <section className="page prose">
      <Link href="/admin">← Admin dashboard</Link>
      <h1>How Mathrix works</h1>
      <p>
        Rules, operations, row/column growth and balance controls. The
        repository also includes README.md and DEPLOYMENT.md for authentication
        and server operations.
      </p>
      <Link className="button" href="/how-to-play">
        Open interactive player tutorial
      </Link>
      <pre className="documentation">{rules}</pre>
    </section>
  );
}
