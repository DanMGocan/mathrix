import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../server/auth";
import { db } from "../server/db";
import { newUsername } from "../server/profiles";
import { mathematicians } from "../lib/profile";
import { createHash } from "node:crypto";
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
await db.query(
  await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
);
for (const user of (
  await db.query(
    'SELECT id,name FROM "user" WHERE NOT "isGuest" AND username IS NULL ORDER BY "createdAt",id',
  )
).rows) {
  await db.query(
    'UPDATE "user" SET username=$2 WHERE id=$1 AND username IS NULL',
    [user.id, await newUsername(user.name)],
  );
}
for (const user of (
  await db.query(
    'SELECT id FROM "user" WHERE "isGuest" AND name LIKE \'Guest-%\'',
  )
).rows) {
  const hash = createHash("sha256").update(user.id).digest();
  const name = `${mathematicians[hash[0] % mathematicians.length]}-${String(hash.readUInt16BE(1) % 10000).padStart(4, "0")}`;
  await db.query('UPDATE "user" SET name=$2 WHERE id=$1', [user.id, name]);
}
console.log("Database migrations applied");
await db.end();
