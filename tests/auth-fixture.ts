import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { betterAuth } from "better-auth";
import { makeSignature } from "better-auth/crypto";
import { auth } from "../server/auth";
import { db } from "../server/db";
import { newUsername } from "../server/profiles";

type Account = { email: string; name?: string; role?: "USER" | "ADMIN" };
function isolated() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.includes("_test_"));
  return url;
}
export async function testSession({
  email,
  name = email.split("@")[0],
  role = "USER",
}: Account) {
  const url = isolated();
  let user = (await db.query('SELECT * FROM "user" WHERE email=$1', [email]))
    .rows[0];
  if (!user) {
    const id = randomUUID(),
      username = await newUsername(name);
    user = (
      await db.query(
        'INSERT INTO "user"(id,name,username,email,"emailVerified",role,disabled,"createdAt","updatedAt") VALUES($1,$2,$3,$4,true,$5,false,now(),now()) RETURNING *',
        [id, name, username, email, role],
      )
    ).rows[0];
  }
  assert.ok(!user.disabled, "Suspended fixture accounts cannot sign in");
  assert.equal(user.emailVerified, true);
  assert.equal(user.isGuest, false);
  assert.equal(
    user.role,
    role,
    "Fixture lookup must not promote an existing user",
  );
  await db.query(
    'INSERT INTO account(id,"userId","accountId","providerId","createdAt","updatedAt") SELECT $1,$2,$2,\'google\',now(),now() WHERE NOT EXISTS(SELECT 1 FROM account WHERE "userId"=$2 AND "providerId"=\'google\')',
    [randomUUID(), user.id],
  );
  await db.query(
    "INSERT INTO player_stats(user_id,rating) VALUES($1,1000) ON CONFLICT DO NOTHING",
    [user.id],
  );
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id);
  assert.ok(session);
  const { name: cookieName, attributes } = context.authCookies.sessionToken;
  const value = encodeURIComponent(
    `${session.token}.${await makeSignature(session.token, context.secret)}`,
  );
  const cookie = `${cookieName}=${value}`;
  const browserCookie = {
    name: cookieName,
    value,
    domain: attributes.domain || url.hostname,
    path: attributes.path || "/",
    httpOnly: attributes.httpOnly ?? true,
    secure: attributes.secure ?? false,
    sameSite: (attributes.sameSite || "lax").replace(/^./, (s) =>
      s.toUpperCase(),
    ) as "Lax" | "Strict" | "None",
    expires: session.expiresAt.getTime() / 1000,
  };
  return { user, cookie, browserCookie };
}
export async function browserSession(
  context: BrowserContext,
  options: Account,
) {
  const session = await testSession(options);
  await context.addCookies([session.browserCookie]);
  return {
    ...session.user,
    name: session.user.username || session.user.name,
    registered: true,
    importPending: false,
  };
}

type OAuthAccount = Account & {
  provider?: "google" | "discord";
  subject?: string;
  verified?: boolean;
  additionalData?: Record<string, unknown>;
  callbackURL?: string;
  newUserCallbackURL?: string;
  errorCallbackURL?: string;
};
const cookieHeader = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
// Real OAuth state, hooks, adapter and session cookies; only the remote provider is mocked.
export async function oauthLogin(options: OAuthAccount) {
  const origin = isolated().origin;
  const {
    provider = "google",
    subject = options.email,
    verified = true,
    name = "OAuth player",
  } = options;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    if (
      [
        "https://oauth2.googleapis.com/token",
        "https://discord.com/api/oauth2/token",
      ].includes(String(args[0]))
    )
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    return originalFetch(...args);
  };
  try {
    const oauth = betterAuth({
      ...auth.options,
      rateLimit: { enabled: false },
      socialProviders: {
        [provider]: {
          clientId: "test-client",
          clientSecret: "test-secret",
          getUserInfo: async () => ({
            user: { name, email: options.email, emailVerified: verified },
            data: { sub: subject, id: subject },
          }),
        },
      },
    });
    const start = await oauth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          callbackURL: options.callbackURL || `${origin}/play`,
          newUserCallbackURL:
            options.newUserCallbackURL || `${origin}/auth/complete`,
          errorCallbackURL: options.errorCallbackURL || `${origin}/auth`,
          additionalData: options.additionalData,
        }),
      }),
    );
    assert.equal(start.status, 200, await start.clone().text());
    const state = new URL((await start.json()).url).searchParams.get("state")!;
    const callbackURL = `${origin}/api/auth/callback/${provider}?state=${encodeURIComponent(state)}&code=test-code`;
    const callback = await oauth.handler(
      new Request(callbackURL, {
        headers: { Cookie: cookieHeader(start), Origin: origin },
      }),
    );
    const cookie = cookieHeader(callback);
    const session = await oauth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    });
    return {
      oauth,
      start,
      callback,
      callbackURL,
      cookie,
      user: session?.user || null,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
export async function mockOAuth(page: Page, options: OAuthAccount) {
  await page.route("**/api/auth/sign-in/social", async (route) => {
    const body = route.request().postDataJSON();
    const result = await oauthLogin({
      ...options,
      provider: body.provider,
      additionalData: body.additionalData,
      callbackURL: body.callbackURL,
      newUserCallbackURL: body.newUserCallbackURL,
      errorCallbackURL: body.errorCallbackURL,
    });
    if (result.user) {
      const context = await auth.$context,
        url = isolated();
      const name = context.authCookies.sessionToken.name;
      const value = result.callback.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${name}=`))!
        .split(";")[0]
        .slice(name.length + 1);
      const attributes = context.authCookies.sessionToken.attributes;
      await page.context().addCookies([
        {
          name,
          value,
          domain: url.hostname,
          path: attributes.path || "/",
          httpOnly: attributes.httpOnly ?? true,
          secure: attributes.secure ?? false,
          sameSite: "Lax",
          expires: Date.now() / 1000 + context.sessionConfig.expiresIn,
        },
      ]);
    }
    await route.fulfill({
      json: { url: result.callback.headers.get("location") },
    });
  });
}
