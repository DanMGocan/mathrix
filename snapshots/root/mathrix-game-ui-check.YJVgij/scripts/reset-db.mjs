import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Client } from "pg";

function resetTarget(source) {
  if (source.PRODUCTION?.toLowerCase() !== "false")
    throw Error(
      "Database reset requires PRODUCTION=false in project-root .env",
    );
  if (!source.DATABASE_URL) throw Error("DATABASE_URL is missing from .env");
  const target = new URL(source.DATABASE_URL);
  const database = decodeURIComponent(target.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !database ||
    ["postgres", "template0", "template1"].includes(database) ||
    /_test(?:_|$)/i.test(database)
  )
    throw Error("Refusing to reset a system or isolated test database");
  return database;
}

if (process.argv.includes("--check")) {
  const source = {
    PRODUCTION: "false",
    DATABASE_URL: "postgresql://localhost/mathrix",
  };
  assert.equal(resetTarget(source), "mathrix");
  assert.equal(resetTarget({ ...source, PRODUCTION: "FALSE" }), "mathrix");
  for (const PRODUCTION of [undefined, "", "true", "invalid"])
    assert.throws(() => resetTarget({ ...source, PRODUCTION }));
  for (const database of ["", "postgres", "template1", "mathrix_test_3100"])
    assert.throws(() =>
      resetTarget({
        ...source,
        DATABASE_URL: `postgresql://localhost/${database}`,
      }),
    );
  console.log("Database reset guards passed");
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const source = parseEnv(
    readFileSync(new URL("../.env", import.meta.url), "utf8"),
  );
  const database = resetTarget(source);
  const client = new Client({
    connectionString: source.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const sessions = await client.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
    );
    if (sessions.rows[0].count)
      throw Error(
        "Database is in use; stop Mathrix and let other agents finish first",
      );
    await client.query(
      "BEGIN; DROP SCHEMA public CASCADE; CREATE SCHEMA public; COMMIT",
    );
  } finally {
    await client.end();
  }
  for (const script of ["migrate", "seed"]) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", `scripts/${script}.ts`],
      { cwd: root, env: { ...process.env, ...source }, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`Database ${script} failed`);
  }
  console.log(`Database ${database} rebuilt and seeded`);
}
