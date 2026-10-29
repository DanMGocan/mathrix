import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { betterAuth } from "/root/mathrix/node_modules/better-auth/dist/index.mjs";
import { auth } from "/root/mathrix/server/auth.ts";
import { db } from "/root/mathrix/server/db.ts";
import { newUsername } from "/root/mathrix/server/profiles.ts";

const origin = process.env.APP_URL!;
const ownerEmail = "gocandan@gmail.com", ownerId = randomUUID();
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/mathrix_admin_oauth_check_20261006");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  if (String(args[0]) === "https://oauth2.googleapis.com/token")
    return Response.json({ access_token: "mock-token", token_type: "Bearer", expires_in: 3600 });
  throw Error("Unexpected outbound HTTP request");
};
const cookies = (response: Response) => response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
const username = await newUsername("gocandan");
try {
  for (const email of ["admin1@mathrix.app", "admin2@mathrix.app", ownerEmail])
    await db.query('INSERT INTO "user" (id,name,email,"emailVerified",role,disabled,username,"createdAt","updatedAt") VALUES ($1,$2,$3,true,\'ADMIN\',false,$2,now(),now())',
      [email === ownerEmail ? ownerId : randomUUID(), email === ownerEmail ? username : email.split("@")[0], email]);
  await db.query('DELETE FROM "user" WHERE role=\'ADMIN\' AND email<>$1', [ownerEmail]);
  assert.deepEqual((await db.query('SELECT email FROM "user" WHERE role=\'ADMIN\'')).rows, [{ email: ownerEmail }]);
  assert.equal((await db.query('SELECT id FROM account WHERE "userId"=$1', [ownerId])).rowCount, 0);
  console.log("PASS: old admin users removed; verified owner is sole ADMIN and has no credential account");

  const oauth = (email: string, subject: string, verified = true) => betterAuth({
    ...auth.options, rateLimit: { enabled: false },
    socialProviders: { google: {
      clientId: "test-client", clientSecret: "test-secret",
      getUserInfo: async () => ({ user: { name: "Google player", email, emailVerified: verified }, data: { sub: subject } }),
    } },
  });
  async function login(provider: ReturnType<typeof betterAuth>) {
    const start = await provider.handler(new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: `${origin}/play` }),
    }));
    assert.equal(start.status, 200);
    const state = new URL((await start.json()).url).searchParams.get("state")!;
    const callback = await provider.handler(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(state)}&code=test-code`, {
      headers: { Cookie: cookies(start), Origin: origin },
    }));
    assert.equal(callback.status, 302);
    return { callback, session: await provider.api.getSession({ headers: new Headers({ Cookie: cookies(callback) }) }) };
  }
  const ownerOAuth = oauth(ownerEmail, randomUUID());
  const first = await login(ownerOAuth);
  assert.equal(first.callback.headers.get("location"), `${origin}/play`);
  assert.equal(first.session?.user.id, ownerId);
  assert.equal(first.session?.user.role, "ADMIN");
  assert.deepEqual((await db.query('SELECT "providerId" FROM account WHERE "userId"=$1', [ownerId])).rows, [{ providerId: "google" }]);
  console.log("PASS: first Google callback links to preprovisioned owner and preserves ADMIN");
  const repeat = await login(ownerOAuth);
  assert.equal(repeat.session?.user.id, ownerId);
  assert.equal(repeat.session?.user.role, "ADMIN");
  assert.equal((await db.query('SELECT id FROM account WHERE "userId"=$1', [ownerId])).rowCount, 1);
  console.log("PASS: repeated Google login uses same owner ID and one Google account");
  const other = await login(oauth("other-google@example.invalid", randomUUID()));
  assert.equal(other.session?.user.role, "USER");
  assert.notEqual(other.session?.user.id, ownerId);
  console.log("PASS: a different Google email receives USER role");
  const signup = await ownerOAuth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Attacker", email: ownerEmail, password: "test-password-only", role: "ADMIN" }),
  }));
  assert.equal(signup.status, 422);
  assert.equal((await db.query('SELECT id FROM account WHERE "userId"=$1 AND "providerId"=\'credential\'', [ownerId])).rowCount, 0);
  assert.equal((await db.query('SELECT id FROM "user" WHERE email=$1', [ownerEmail])).rows[0].id, ownerId);
  console.log("PASS: email signup cannot capture owner email or add credentials");
  assert.deepEqual((await db.query('SELECT email FROM "user" WHERE role=\'ADMIN\'')).rows, [{ email: ownerEmail }]);
  console.log("PASS: owner remains the only admin after all login and signup checks");
} finally {
  globalThis.fetch = originalFetch;
  await db.end();
}
