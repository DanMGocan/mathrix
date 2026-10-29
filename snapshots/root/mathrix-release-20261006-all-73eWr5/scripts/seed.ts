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
console.log("Settings and campaign seeded");
await db.end();
