import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db } from "./db";

export class EmailError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const messageFields = {
  subject: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  body: z
    .string()
    .trim()
    .min(1)
    .max(10000)
    .refine((s) => !s.includes("\0")),
};
export const communityEmailSchema = z.object(messageFields).strict();
export const weeklyEmailSchema = z
  .object({
    ...messageFields,
    enabled: z.boolean(),
    dayOfWeek: z.number().int().min(0).max(6),
    hourUtc: z.number().int().min(0).max(23),
  })
  .strict();
type WeeklyEmail = z.infer<typeof weeklyEmailSchema> & { nextRunAt: string };
type Campaign = {
  id: string;
  kind: "manual" | "weekly";
  subject: string;
  body: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: Date;
  finished_at: Date | null;
  error: string | null;
};

const settingsKey = "community_email";
const defaults = {
  enabled: true,
  dayOfWeek: 1,
  hourUtc: 9,
  subject: "We miss you at Mathrix",
  body: "We miss you at Mathrix!\n\nReady for another match? Come back and challenge the community. Your next great game is waiting.",
};
const eligibleUsers = `FROM "user" u WHERE NOT u."isGuest" AND NOT u.disabled
  AND u."emailVerified" = true
  AND char_length(btrim(u.email)) <= 254
  AND lower(btrim(u.email)) ~ '^[a-z0-9_+''.-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\\.)+[a-z]{2,}$'
  AND btrim(u.email) NOT LIKE '.%' AND btrim(u.email) NOT LIKE '%..%'
  AND lower(btrim(u.email)) !~ '@([^@]*\\.)?(invalid|test|example|localhost)$'
  AND lower(btrim(u.email)) !~ '@(example\\.(com|net|org)|localhost)$'
  AND NOT EXISTS (SELECT 1 FROM email_unsubscribes x WHERE x.user_id=u.id OR x.email=lower(btrim(u.email)))`;
const campaignSelect = `SELECT c.*,
  count(r.email)::int AS total,
  count(r.email) FILTER (WHERE r.status='sent')::int AS sent,
  count(r.email) FILTER (WHERE r.status IN ('failed','skipped'))::int AS failed
  FROM email_campaigns c LEFT JOIN email_recipients r ON r.campaign_id=c.id`;

function nextRun(day: number, hour: number, now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + ((day - next.getUTCDay() + 7) % 7));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}

function configuration() {
  const missing = [
    "BREVO_SMTP_KEY",
    "BREVO_SMTP_LOGIN",
    "BREVO_FROM_EMAIL",
  ].filter((key) => !process.env[key]?.trim());
  if (
    process.env.BREVO_FROM_EMAIL?.trim() &&
    !z.email().safeParse(process.env.BREVO_FROM_EMAIL.trim()).success
  )
    missing.push("BREVO_FROM_EMAIL");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    missing.push("AUTH_SECRET");
  const port = Number(process.env.BREVO_SMTP_PORT?.trim() || "587");
  if (![587, 2525, 465].includes(port)) missing.push("BREVO_SMTP_PORT");
  let appURL = "";
  try {
    const url = new URL(process.env.APP_URL || "http://localhost:3000");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Invalid URL");
    appURL = url.origin;
  } catch {
    missing.push("APP_URL");
  }
  return { configured: missing.length === 0, missing, appURL, port };
}

async function ensureSettings() {
  await db.query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [
      settingsKey,
      { ...defaults, nextRunAt: nextRun(defaults.dayOfWeek, defaults.hourUtc) },
    ],
  );
}

function campaignSummary(c: Campaign) {
  return {
    id: c.id,
    kind: c.kind,
    subject: c.subject,
    status: c.status,
    total: c.total,
    sent: c.sent,
    failed: c.failed,
    createdAt: c.created_at.toISOString(),
    finishedAt: c.finished_at?.toISOString() ?? null,
    ...(c.error ? { error: c.error } : {}),
  };
}

export async function getEmailDashboard() {
  await ensureSettings();
  const [settings, recipients, campaigns] = await Promise.all([
    db.query("SELECT value FROM settings WHERE key=$1", [settingsKey]),
    db.query(
      `SELECT count(DISTINCT lower(btrim(u.email)))::int AS count ${eligibleUsers}`,
    ),
    db.query(
      `${campaignSelect} GROUP BY c.id ORDER BY c.created_at DESC LIMIT 20`,
    ),
  ]);
  const { configured, missing } = configuration();
  return {
    configured,
    missing,
    recipientCount: recipients.rows[0].count as number,
    weekly: settings.rows[0].value as WeeklyEmail,
    campaigns: campaigns.rows.map(campaignSummary),
  };
}

export async function saveWeeklyEmail(input: unknown) {
  const data = weeklyEmailSchema.parse(input);
  await ensureSettings();
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const previous = (
      await c.query("SELECT value FROM settings WHERE key=$1 FOR UPDATE", [
        settingsKey,
      ])
    ).rows[0].value as WeeklyEmail;
    const nextRunAt =
      previous.enabled !== data.enabled ||
      previous.dayOfWeek !== data.dayOfWeek ||
      previous.hourUtc !== data.hourUtc
        ? nextRun(data.dayOfWeek, data.hourUtc)
        : previous.nextRunAt;
    await c.query(
      "UPDATE settings SET value=$2,updated_at=now() WHERE key=$1",
      [settingsKey, { ...data, nextRunAt }],
    );
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  return getEmailDashboard();
}

async function createCampaign(
  c: PoolClient,
  kind: "manual" | "weekly",
  data: z.infer<typeof communityEmailSchema>,
  adminId: string | null,
  scheduledAt: string | null = null,
) {
  const id = randomUUID();
  await c.query(
    "INSERT INTO email_campaigns(id,kind,subject,body,created_by,scheduled_at) VALUES($1,$2,$3,$4,$5,$6)",
    [id, kind, data.subject, data.body, adminId, scheduledAt],
  );
  await c.query(
    `INSERT INTO email_recipients(campaign_id,user_id,email)
    SELECT $1,id,email FROM (SELECT DISTINCT ON (lower(btrim(u.email)))
      u.id,lower(btrim(u.email)) AS email ${eligibleUsers} ORDER BY lower(btrim(u.email)),u.id) recipients`,
    [id],
  );
  await c.query(
    "UPDATE email_campaigns SET status='completed',finished_at=now() WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM email_recipients WHERE campaign_id=$1)",
    [id],
  );
  return id;
}

export async function queueCommunityEmail(input: unknown, adminId: string) {
  const data = communityEmailSchema.parse(input);
  const config = configuration();
  if (!config.configured)
    throw new EmailError(
      `Email sending is not configured. Set ${config.missing.join(", ")}.`,
      503,
    );
  const c = await db.connect();
  let id: string;
  try {
    await c.query("BEGIN");
    id = await createCampaign(c, "manual", data, adminId);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  return campaignSummary(
    (await db.query(`${campaignSelect} WHERE c.id=$1 GROUP BY c.id`, [id]))
      .rows[0],
  );
}

function unsubscribeToken(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify([userId, email])).toString(
    "base64url",
  );
  const signature = createHmac("sha256", process.env.AUTH_SECRET!)
    .update(`community-email:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function readUnsubscribeToken(token: string) {
  try {
    if (
      token.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw Error("Malformed token");
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
      throw new EmailError(
        "Email preferences are temporarily unavailable.",
        503,
      );
    const [payload, signature] = token.split(".");
    const expected = createHmac("sha256", process.env.AUTH_SECRET)
      .update(`community-email:${payload}`)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw Error("Invalid signature");
    return z
      .tuple([z.string().min(1).max(200), z.email().max(254)])
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch (error) {
    if (error instanceof EmailError) throw error;
    throw new EmailError("This unsubscribe link is invalid.");
  }
}

function escapeHTML(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function emailUnsubscribePage(token: string) {
  readUnsubscribeToken(token);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mathrix email preferences</title><body><main><h1>Unsubscribe from Mathrix community emails?</h1><p>You can stop weekly reminders and community announcements here.</p><form method="post" action="/api/email/unsubscribe?token=${escapeHTML(token)}"><button type="submit">Unsubscribe</button></form></main></body></html>`;
}

export async function unsubscribeCommunityEmail(token: string) {
  const [userId, email] = readUnsubscribeToken(token);
  await db.query(
    'INSERT INTO email_unsubscribes(user_id,email) SELECT id,$2 FROM "user" WHERE id=$1 ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,created_at=now()',
    [userId, email],
  );
}

let currentJob: Promise<void> | null = null;
let stopping = false;

async function processEmailJobs() {
  await ensureSettings();
  const config = configuration();
  if (!config.configured || stopping) return;
  const c = await db.connect();
  let locked = false;
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    host: "smtp-relay.brevo.com",
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: {
      user: process.env.BREVO_SMTP_LOGIN!.trim(),
      pass: process.env.BREVO_SMTP_KEY!.trim(),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 5000,
  });
  try {
    // ponytail: one sender for the community; use partitioned worker claims if throughput exceeds these 100-message batches.
    locked = (await c.query("SELECT pg_try_advisory_lock(731249860) AS locked"))
      .rows[0].locked;
    if (!locked) return;
    await c.query(
      "UPDATE email_recipients SET status='failed',error='Delivery outcome unknown after worker interruption; not retried.',updated_at=now() WHERE status='sending'",
    );
    await c.query("BEGIN");
    try {
      const weekly = (
        await c.query("SELECT value FROM settings WHERE key=$1 FOR UPDATE", [
          settingsKey,
        ])
      ).rows[0].value as WeeklyEmail;
      if (weekly.enabled && Date.parse(weekly.nextRunAt) <= Date.now()) {
        await createCampaign(
          c,
          "weekly",
          communityEmailSchema.parse({
            subject: weekly.subject,
            body: weekly.body,
          }),
          null,
          weekly.nextRunAt,
        );
        await c.query(
          "UPDATE settings SET value=$2,updated_at=now() WHERE key=$1",
          [
            settingsKey,
            { ...weekly, nextRunAt: nextRun(weekly.dayOfWeek, weekly.hourUtc) },
          ],
        );
      }
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    }
    const deadline = Date.now() + 40000;
    let processed = 0;
    let providerFailed = false;
    while (!stopping && processed < 100 && Date.now() < deadline) {
      const campaign = (
        await c.query(
          "SELECT * FROM email_campaigns WHERE status IN ('queued','sending') ORDER BY created_at,id LIMIT 1",
        )
      ).rows[0] as Campaign | undefined;
      if (!campaign) break;
      await c.query("UPDATE email_campaigns SET status='sending' WHERE id=$1", [
        campaign.id,
      ]);
      while (!stopping && processed < 100 && Date.now() < deadline) {
        const recipient = (
          await c.query(
            `UPDATE email_recipients SET status='sending',updated_at=now()
          WHERE campaign_id=$1 AND email=(SELECT email FROM email_recipients WHERE campaign_id=$1 AND status='pending' ORDER BY email LIMIT 1)
          AND status='pending' RETURNING user_id,email`,
            [campaign.id],
          )
        ).rows[0];
        if (!recipient) break;
        processed++;
        const eligible =
          (
            await c.query(
              `SELECT u.id ${eligibleUsers} AND u.id=$1 AND lower(btrim(u.email))=$2`,
              [recipient.user_id, recipient.email],
            )
          ).rows.length > 0;
        if (!eligible) {
          await c.query(
            "UPDATE email_recipients SET status='skipped',error='Recipient is no longer eligible.',updated_at=now() WHERE campaign_id=$1 AND email=$2 AND status='sending'",
            [campaign.id, recipient.email],
          );
          continue;
        }
        const unsubscribe = `${config.appURL}/api/email/unsubscribe?token=${unsubscribeToken(recipient.user_id, recipient.email)}`;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const info = await Promise.race([
            transport.sendMail({
              from: {
                name: process.env.BREVO_FROM_NAME?.trim() || "Mathrix",
                address: process.env.BREVO_FROM_EMAIL!.trim(),
              },
              to: { address: recipient.email, name: "" },
              subject: campaign.subject,
              text: `${campaign.body}\n\nPlay Mathrix: ${config.appURL}\n\nUnsubscribe from community emails: ${unsubscribe}`,
              html: `<div>${escapeHTML(campaign.body).replace(/\r?\n/g, "<br>")}</div><p><a href="${escapeHTML(config.appURL)}">Play Mathrix</a></p><p><a href="${escapeHTML(unsubscribe)}">Unsubscribe from community emails</a></p>`,
              headers: {
                "List-Unsubscribe": `<${unsubscribe}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
              disableFileAccess: true,
              disableUrlAccess: true,
            }),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                transport.close();
                reject(Error("SMTP deadline"));
              }, 20000);
            }),
          ]);
          if (
            !info.accepted?.some(
              (address) => String(address).toLowerCase() === recipient.email,
            )
          )
            throw Object.assign(Error("Recipient was not accepted"), {
              code: "EENVELOPE",
              command: "RCPT TO",
              responseCode: 550,
            });
        } catch (error) {
          const smtp = error as {
            code?: string;
            command?: string;
            responseCode?: number;
          };
          const rejectedRecipient =
            smtp?.code === "EENVELOPE" &&
            smtp.command?.startsWith("RCPT") &&
            Number(smtp.responseCode) >= 500;
          await c.query(
            "UPDATE email_recipients SET status='failed',error=$3,updated_at=now() WHERE campaign_id=$1 AND email=$2 AND status='sending'",
            [
              campaign.id,
              recipient.email,
              rejectedRecipient
                ? "The recipient mailbox rejected this email."
                : "SMTP delivery failed or its outcome is unknown; not retried.",
            ],
          );
          if (rejectedRecipient) continue;
          await c.query(
            "UPDATE email_recipients SET status='failed',error='Campaign stopped after SMTP error; this recipient was not sent.',updated_at=now() WHERE campaign_id=$1 AND status='pending'",
            [campaign.id],
          );
          providerFailed = true;
          transport.close();
          break;
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        await c.query(
          "UPDATE email_recipients SET status='sent',updated_at=now() WHERE campaign_id=$1 AND email=$2 AND status='sending'",
          [campaign.id, recipient.email],
        );
      }
      await c.query(
        `UPDATE email_campaigns SET
        status=CASE WHEN EXISTS (SELECT 1 FROM email_recipients WHERE campaign_id=$1 AND status IN ('pending','sending')) THEN 'sending'
          WHEN EXISTS (SELECT 1 FROM email_recipients WHERE campaign_id=$1 AND status IN ('failed','skipped')) THEN 'completed_with_errors' ELSE 'completed' END,
        finished_at=CASE WHEN EXISTS (SELECT 1 FROM email_recipients WHERE campaign_id=$1 AND status IN ('pending','sending')) THEN NULL ELSE now() END,
        error=CASE WHEN EXISTS (SELECT 1 FROM email_recipients WHERE campaign_id=$1 AND status IN ('failed','skipped')) THEN 'Some recipients failed, were skipped, or have an unknown delivery outcome. No automatic retries.' ELSE NULL END
        WHERE id=$1`,
        [campaign.id],
      );
      if (
        providerFailed ||
        processed >= 100 ||
        Date.now() >= deadline ||
        stopping
      )
        break;
    }
  } finally {
    transport.close();
    if (locked)
      await c.query("SELECT pg_advisory_unlock(731249860)").catch(() => {});
    c.release();
  }
}

export function runEmailJobs() {
  if (stopping) return Promise.resolve();
  if (!currentJob)
    currentJob = processEmailJobs().finally(() => {
      currentJob = null;
    });
  return currentJob;
}

export async function stopEmailJobs() {
  stopping = true;
  await currentJob?.catch(() => {});
}
