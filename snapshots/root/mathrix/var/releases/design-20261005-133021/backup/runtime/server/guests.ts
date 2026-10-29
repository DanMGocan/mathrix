import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { db, redis } from "./db";
import type { Identity } from "./ads";
import { mathematicians } from "../lib/profile";

export const guestSessionSeconds = 7 * 24 * 60 * 60;
export const importingGuests = new Set<string>();
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function guestCode(id: string) {
  const signature = createHmac("sha256", process.env.AUTH_SECRET!)
    .update(`mathrix:guest-code:v1:${id}`)
    .digest("base64url");
  return `MXG.${id}.${signature}`;
}
export async function guestFromCode(code: string) {
  const value = code.trim();
  const match = /^MXG\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (
    !match ||
    !timingSafeEqual(Buffer.from(value), Buffer.from(guestCode(match[1])))
  )
    throw Error("Invalid or unavailable guest code");
  const guest = await guestIdentity(match[1]);
  if (!guest) throw Error("Invalid or unavailable guest code");
  return guest;
}
export async function guestIdentity(id: string): Promise<Identity | null> {
  const row = (
    await db.query(
      'SELECT id,name FROM "user" WHERE id=$1 AND "isGuest" AND NOT disabled',
      [id],
    )
  ).rows[0];
  return row ? { ...row, registered: false, role: "GUEST" } : null;
}
export async function createGuest(startingRating: number) {
  const id = randomUUID(),
    name = `${mathematicians[randomInt(mathematicians.length)]}-${String(randomInt(10000)).padStart(4, "0")}`;
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt",role,disabled,"isGuest") VALUES ($1,$2,$3,false,now(),now(),\'USER\',false,true)',
      [id, name, `${id}@guest.mathrix.invalid`],
    );
    await c.query("INSERT INTO player_stats(user_id,rating) VALUES($1,$2)", [
      id,
      startingRating,
    ]);
    await c.query("COMMIT");
    return { id, name, registered: false, role: "GUEST" } satisfies Identity;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function createGuestSession(id: string) {
  const token = randomBytes(32).toString("base64url");
  await redis.set(`guest-session:${token}`, id, { EX: guestSessionSeconds });
  return token;
}
export async function guestFromSession(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = await redis.get(`guest-session:${token}`);
  return id ? guestIdentity(id) : null;
}

export async function prepareGuestImport(guestId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO guest_imports(id,guest_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [digest(token), guestId],
  );
  return token;
}
export async function validateGuestImport(id: string) {
  const intent = (
    await db.query(
      'SELECT i.id FROM guest_imports i JOIN "user" g ON g.id=i.guest_id WHERE i.id=$1 AND i.consumed_at IS NULL AND i.expires_at>now() AND g."isGuest" AND NOT g.disabled AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."guestImportId"=i.id)',
      [id],
    )
  ).rows[0];
  if (!intent)
    throw Error(
      "Guest import expired or was already used. Enter the code again before signup.",
    );
  return id;
}
export async function importIdFromToken(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw Error("Invalid guest import request");
  return validateGuestImport(digest(token));
}
export async function pendingGuestImport(
  userId: string,
): Promise<string | null> {
  return (
    (
      await db.query(
        'SELECT i.guest_id FROM guest_imports i JOIN "user" u ON u."guestImportId"=i.id WHERE u.id=$1 AND i.consumed_at IS NULL',
        [userId],
      )
    ).rows[0]?.guest_id ?? null
  );
}

// The intent is attached by the auth user-creation hook, never by an existing account.
export async function finishGuestImport(userId: string, skip: boolean) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const user = (
      await c.query(
        'SELECT "guestImportId" FROM "user" WHERE id=$1 AND NOT "isGuest" AND NOT disabled FOR UPDATE',
        [userId],
      )
    ).rows[0];
    if (!user) throw Error("Account unavailable");
    if (!user.guestImportId) {
      await c.query("COMMIT");
      return null;
    }
    const intent = (
      await c.query("SELECT * FROM guest_imports WHERE id=$1 FOR UPDATE", [
        user.guestImportId,
      ])
    ).rows[0];
    if (!intent || intent.consumed_at) throw Error("Guest import unavailable");
    if (!skip) {
      const guest = (
        await c.query(
          'SELECT id FROM "user" WHERE id=$1 AND "isGuest" AND NOT disabled FOR UPDATE',
          [intent.guest_id],
        )
      ).rows[0];
      if (!guest)
        throw Error(
          "Guest was already imported or is unavailable. Skip to keep this new account.",
        );
      const played = (
        await c.query(
          "SELECT 1 FROM match_participants WHERE user_id=$1 LIMIT 1",
          [userId],
        )
      ).rowCount;
      if (played)
        throw Error("Guest import is only available during account creation");
      await c.query("DELETE FROM player_stats WHERE user_id=$1", [userId]);
      await c.query("UPDATE player_stats SET user_id=$1 WHERE user_id=$2", [
        userId,
        guest.id,
      ]);
      await c.query(
        "UPDATE match_participants SET user_id=$1 WHERE user_id=$2",
        [userId, guest.id],
      );
      await c.query("UPDATE rating_history SET user_id=$1 WHERE user_id=$2", [
        userId,
        guest.id,
      ]);
      await c.query('DELETE FROM "user" WHERE id=$1', [guest.id]);
    }
    await c.query("UPDATE guest_imports SET consumed_at=now() WHERE id=$1", [
      intent.id,
    ]);
    await c.query('UPDATE "user" SET "guestImportId"=NULL WHERE id=$1', [
      userId,
    ]);
    await c.query("COMMIT");
    return skip ? null : (intent.guest_id as string);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
