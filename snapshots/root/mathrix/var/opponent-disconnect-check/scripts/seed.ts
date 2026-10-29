import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../server/db";
import { newUsername } from "../server/profiles";
import { defaultAds, defaultBalance } from "../lib/config";
for (const [key, value] of [
  ["balance", defaultBalance],
  ["ads", defaultAds],
])
  await db.query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [key, JSON.stringify(value)],
  );
await db.query(
  `INSERT INTO ad_campaigns(id,name,headline,body,destination_url,cta,audience) VALUES('mathrix-welcome','Welcome to Mathrix','A little chaos. A lot of maths.','Grow your matrix, shield your rows, and steal the lead.','https://mathrix.app/how-to-play','Learn the rules','everyone') ON CONFLICT DO NOTHING`,
);
if (process.env.SEED_TEST_ADMINS === "true")
  for (const email of ["admin1@mathrix.app", "admin2@mathrix.app"]) {
    const existing = await db.query('SELECT id FROM "user" WHERE email=$1', [
      email,
    ]);
    if (!existing.rowCount) {
      const id = randomUUID();
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          'INSERT INTO "user"(id,name,email,"emailVerified",role,disabled,"createdAt","updatedAt") VALUES($1,$2,$3,true,\'ADMIN\',false,now(),now())',
          [id, email.split("@")[0], email],
        );
        await client.query(
          'INSERT INTO account(id,"userId","accountId","providerId",password,"createdAt","updatedAt") VALUES($1,$2,$2,\'credential\',$3,now(),now())',
          [randomUUID(), id, await hashPassword("amdin")],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  }
for (const user of (
  await db.query(
    'SELECT id,name FROM "user" WHERE NOT "isGuest" AND username IS NULL',
  )
).rows)
  await db.query('UPDATE "user" SET username=$2 WHERE id=$1', [
    user.id,
    await newUsername(user.name),
  ]);
await db.query(
  'INSERT INTO player_stats(user_id,rating) SELECT id,$1 FROM "user" ON CONFLICT DO NOTHING',
  [defaultBalance.startingRating],
);
console.log(
  "Settings, campaign and enabled test admins seeded (existing credentials unchanged)",
);
await db.end();
