import { cookies } from "next/headers";
import { cache } from "react";

export const isAdministrator = cache(async () => {
  const jar = await cookies();
  try {
    const res = await fetch(
      `${process.env.GAME_INTERNAL_URL || "http://127.0.0.1:3001"}/api/me?refresh=false`,
      { headers: { cookie: jar.toString() }, cache: "no-store" },
    );
    return res.ok && (await res.json())?.role === "ADMIN";
  } catch {
    return false;
  }
});
