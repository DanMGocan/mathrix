// Run: node --env-file=/etc/mathrix.env --import tsx var/admin-account-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { db } from "../server/db.ts";

try {
  const admins = (await db.query('SELECT email,disabled,"emailVerified" FROM "user" WHERE role=\'ADMIN\'')).rows;
  assert.deepEqual(admins, [{ email: "gocandan@gmail.com", disabled: false, emailVerified: true }]);
  assert.equal((await db.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [["admin1@mathrix.app", "admin2@mathrix.app"]])).rowCount, 0);
  assert.equal((await db.query('SELECT a.id FROM account a JOIN "user" u ON u.id=a."userId" WHERE u.email=$1 AND a."providerId"=\'credential\'', ["gocandan@gmail.com"])).rowCount, 0);
  for (const file of [new URL("../.env", import.meta.url), "/etc/mathrix.env"])
    assert.equal(parseEnv(readFileSync(file, "utf8")).SEED_TEST_ADMINS, "false");
  const origin = process.env.APP_URL;
  assert.equal((await (await fetch(`${origin}/api/providers`)).json()).google, true);
  assert.equal((await (await fetch(`${origin}/api/health`)).json()).status, "ok");
  for (const email of ["admin1@mathrix.app", "admin2@mathrix.app"])
    assert.equal((await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "amdin" }),
    })).status, 401);
  console.log("Sole administrator, Google configuration, removed logins and disabled test seeding verified.");
} finally {
  await db.end();
}
