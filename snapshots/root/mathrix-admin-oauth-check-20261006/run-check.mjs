// Run: node /root/mathrix-admin-oauth-check-20261006/run-check.mjs
// Clones schema only; application data, services and real OAuth providers are untouched.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
const database = "mathrix_admin_oauth_check_20261006";
const source = parseEnv(readFileSync("/etc/mathrix.env", "utf8"));
const connection = new URL(source.DATABASE_URL);
const role = decodeURIComponent(connection.username);
assert.match(role, /^[a-zA-Z_][a-zA-Z0-9_]*$/);
assert.equal(connection.pathname, "/mathrix");
function postgres(args, input) {
  const result = spawnSync("runuser", ["-u", "postgres", "--", ...args], {
    encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error(`${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}
assert.equal(postgres(["psql", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${database}'`]).trim(), "", "scratch database must not already exist");
const schema = postgres(["pg_dump", "--schema-only", "--no-owner", "--no-privileges", "mathrix"]);
postgres(["createdb", "--owner", role, database]);
try {
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], `SET ROLE "${role}";\n${schema}`);
  connection.pathname = `/${database}`;
  const result = spawnSync(process.execPath, ["--import", "/root/mathrix/node_modules/tsx/dist/loader.mjs", new URL("verify.ts", import.meta.url).pathname], {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      DATABASE_URL: connection.href,
      REDIS_URL: "redis://127.0.0.1:6379",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      APP_URL: "http://localhost:46120",
      GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
      DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "",
    },
  });
  assert.equal(result.status, 0, "OAuth verification must pass");
} finally {
  postgres(["dropdb", database]);
  console.log("PASS: isolated database removed; no environment credentials written to disk");
}
