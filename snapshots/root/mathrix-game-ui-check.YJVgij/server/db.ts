import { Pool } from "pg";
import { createClient } from "redis";
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
});
export const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", () =>
  console.error(JSON.stringify({ level: "error", event: "redis_error" })),
);
export async function connectRedis() {
  if (!redis.isOpen) await redis.connect();
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const n = Number(
    await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      { keys: [`limit:${key}`], arguments: [String(seconds)] },
    ),
  );
  return n <= limit;
}
