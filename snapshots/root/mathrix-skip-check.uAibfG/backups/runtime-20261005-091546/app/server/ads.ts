import { randomInt, randomUUID } from "node:crypto";
import { db, redis } from "./db";
import { type AdConfig } from "../lib/config";
export type Identity = {
  id: string;
  name: string;
  registered: boolean;
  role: string;
};
export type AdExperience = {
  kind: "none" | "house" | "mock" | "unavailable" | "h5";
  durationMs: number;
  h5?: { clientId: string; testMode: boolean };
  impressionId?: string;
  campaign?: {
    id: string;
    headline: string;
    body: string;
    image_url: string;
    destination_url: string;
    cta: string;
  };
};
export interface AdProvider {
  loadAd(
    player: Identity,
    matchId: string,
    config: AdConfig,
  ): Promise<AdExperience>;
}
const house: AdProvider = {
  async loadAd(p, matchId, c) {
    const rows = await db.query(
      "SELECT * FROM ad_campaigns WHERE active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) AND audience IN ('everyone',$1)",
      [p.registered ? "registered" : "guests"],
    );
    const total = rows.rows.reduce((s, r) => s + Number(r.weight), 0);
    if (!total) return { kind: "none", durationMs: 0 };
    let pick = randomInt(total);
    const campaign = rows.rows.find((r) => (pick -= Number(r.weight)) < 0)!;
    return {
      kind: "house",
      durationMs: Math.min(
        c.maxWaitMs,
        Number(campaign.duration_ms) || c.houseDurationMs,
      ),
      impressionId: randomUUID(),
      campaign: {
        id: campaign.id,
        headline: campaign.headline,
        body: campaign.body,
        image_url: campaign.image_url,
        destination_url: campaign.destination_url,
        cta: campaign.cta,
      },
    };
  },
};
export function h5Config(c: AdConfig) {
  const clientId = process.env.AD_PROVIDER_CLIENT_ID || "";
  return {
    enabled:
      process.env.AD_PROVIDER === "adsense-h5" &&
      /^ca-pub-\d{16}$/.test(clientId) &&
      c.enabled &&
      c.pregame &&
      ["EXTERNAL_PROVIDER", "HYBRID"].includes(c.mode),
    clientId: /^ca-pub-\d{16}$/.test(clientId) ? clientId : "",
    testMode: c.testMode,
  };
}
const external: AdProvider = {
  async loadAd(_p, _id, c) {
    const h5 = h5Config(c);
    if (h5.enabled) return { kind: "h5", durationMs: c.pregameWaitMs, h5 };
    if (process.env.AD_PROVIDER === "adsense-h5")
      return { kind: "unavailable", durationMs: c.pregameWaitMs };
    if (c.testMode && process.env.AD_PROVIDER === "mock")
      return { kind: "mock", durationMs: Math.min(3000, c.maxWaitMs) };
    return { kind: "unavailable", durationMs: 0 };
  },
};
export async function adFor(
  p: Identity,
  matchId: string,
  c: AdConfig,
  consent: boolean,
): Promise<AdExperience> {
  if (
    !c.enabled ||
    !c.pregame ||
    c.mode === "OFF" ||
    (p.role === "ADMIN" && !c.admins) ||
    (!p.registered && !c.guests) ||
    (p.registered && p.role !== "ADMIN" && !c.registered)
  )
    return { kind: "none", durationMs: 0 };
  const counter = await redis.incr(`ad:matches:${p.id}`);
  await redis.expire(`ad:matches:${p.id}`, 86400);
  if (
    (counter - 1) % c.everyN !== 0 ||
    (await redis.exists(`ad:cooldown:${p.id}`))
  )
    return { kind: "none", durationMs: 0 };
  if (c.cooldownMinutes > 0)
    await redis.set(`ad:cooldown:${p.id}`, "1", {
      EX: Math.ceil(c.cooldownMinutes * 60),
    });
  if (c.mode === "HOUSE_ADS") return house.loadAd(p, matchId, c);
  // H5 consent is handled by Google's CMP in the browser, not a local checkbox.
  if (consent || process.env.AD_PROVIDER === "adsense-h5") {
    const ad = await external.loadAd(p, matchId, c);
    if (ad.kind !== "unavailable" || c.mode === "EXTERNAL_PROVIDER") return ad;
  }
  return c.mode === "HYBRID"
    ? house.loadAd(p, matchId, c)
    : { kind: "none", durationMs: 0 };
}
export async function recordImpression(
  p: Identity,
  matchId: string,
  a: AdExperience,
) {
  if (a.kind === "house")
    await db.query(
      "INSERT INTO ad_impressions(id,campaign_id,player_id,match_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [a.impressionId, a.campaign!.id, p.id, matchId],
    );
}
