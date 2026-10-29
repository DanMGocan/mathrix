import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../server/auth";
import { db } from "../server/db";
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
await db.query(
  await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
);
console.log("Database migrations applied");
await db.end();
