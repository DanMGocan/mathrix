import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { cache } from "react";

export const isAdministrator = cache(async () => {
  const jar = await cookies();
  const ip = (await headers()).get("x-forwarded-for")?.trim();
  try {
    const res = await fetch(
      `${process.env.GAME_INTERNAL_URL || "http://127.0.0.1:3001"}/api/me?refresh=false`,
      {
        headers: {
          cookie: jar.toString(),
          ...(ip && isIP(ip) ? { "x-forwarded-for": ip } : {}),
        },
        cache: "no-store",
      },
    );
    return res.ok && (await res.json())?.role === "ADMIN";
  } catch {
    return false;
  }
});
