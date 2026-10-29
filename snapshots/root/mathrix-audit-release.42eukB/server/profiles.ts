import { randomBytes } from "node:crypto";
import { db } from "./db";
import { usernameSchema, type PlayerAppearance } from "../lib/profile";

export async function newUsername(name: string, requested?: unknown) {
  const base =
    requested === undefined
      ? name
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Za-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24)
      : usernameSchema.parse(requested);
  let candidate = base.length >= 3 ? base : "Player";
  for (;;) {
    const exists = await db.query(
      'SELECT 1 FROM "user" WHERE lower(username)=lower($1)',
      [candidate],
    );
    if (!exists.rowCount) return candidate;
    if (requested !== undefined) throw Error("That username is already taken.");
    candidate = `${base.slice(0, 15) || "Player"}-${randomBytes(4).toString("hex")}`;
  }
}

// Only these public fields may enter a game snapshot. Billing IDs stay private.
export function appearance(row: PlayerAppearance): PlayerAppearance {
  return {
    avatarId: row.avatarId || "robot-01",
    city: row.city || "",
    countryCode: row.countryCode || "",
    premium: row.premium === true,
  };
}

export const premiumSQL =
  "COALESCE(b.paid_until>now() AND b.status IN ('active','past_due'),false)";
