import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";

test("community mail persists schedules, sends privately once, and honors unsubscribe and SMTP failures", async (t) => {
  const env = [
    "AUTH_SECRET",
    "APP_URL",
    "BREVO_SMTP_KEY",
    "BREVO_SMTP_LOGIN",
    "BREVO_FROM_EMAIL",
    "BREVO_FROM_NAME",
    "BREVO_SMTP_PORT",
  ];
  const previous = env.map((key) => process.env[key]);
  t.after(() =>
    env.forEach((key, i) =>
      previous[i] === undefined
        ? delete process.env[key]
        : (process.env[key] = previous[i]),
    ),
  );
  Object.assign(process.env, {
    AUTH_SECRET: "local-email-test-secret-at-least-32-characters",
    APP_URL: "https://mathrix.test",
    BREVO_SMTP_KEY: "local-test-password",
    BREVO_SMTP_LOGIN: "login@smtp-brevo.com",
    BREVO_FROM_EMAIL: "hello@mathrix.app",
    BREVO_FROM_NAME: "Mathrix",
  });
  delete process.env.BREVO_SMTP_PORT;
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 6, 12) });

  const users = [
    {
      id: "alice",
      email: "alice@real-domain.com",
      emailVerified: true,
      isGuest: false,
      disabled: false,
    },
    {
      id: "alice2",
      email: "ALICE@real-domain.com",
      emailVerified: true,
      isGuest: false,
      disabled: false,
    },
    {
      id: "bob",
      email: "bob@real-domain.com",
      emailVerified: true,
      isGuest: false,
      disabled: false,
    },
    {
      id: "guest",
      email: "guest@real-domain.com",
      emailVerified: true,
      isGuest: true,
      disabled: false,
    },
    {
      id: "disabled",
      email: "disabled@real-domain.com",
      emailVerified: true,
      isGuest: false,
      disabled: true,
    },
    {
      id: "fake",
      email: "seed@example.invalid",
      emailVerified: true,
      isGuest: false,
      disabled: false,
    },
    {
      id: "unverified",
      email: "unverified@real-domain.com",
      emailVerified: false,
      isGuest: false,
      disabled: false,
    },
  ];
  const unsubscribes = new Map<string, string>();
  type Recipient = {
    campaign_id: string;
    user_id: string;
    email: string;
    status: string;
  };
  type Campaign = {
    id: string;
    kind: string;
    subject: string;
    body: string;
    status: string;
    created_at: Date;
    finished_at: Date | null;
    error: string | null;
    scheduled_at: string | null;
  };
  const campaigns: Campaign[] = [];
  const recipients: Recipient[] = [];
  let weekly: Record<string, unknown> | undefined;
  let lockAvailable = true;
  const queries: string[] = [];
  const eligible = () =>
    users.filter(
      (u) =>
        !u.isGuest &&
        !u.disabled &&
        u.emailVerified &&
        !u.email.endsWith(".invalid") &&
        !unsubscribes.has(u.id) &&
        ![...unsubscribes.values()].includes(u.email.toLowerCase()),
    );
  const summary = (c: Campaign) => {
    const rows = recipients.filter((r) => r.campaign_id === c.id);
    return {
      ...c,
      total: rows.length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => ["failed", "skipped"].includes(r.status))
        .length,
    };
  };
  const query = async (sql: string, args: unknown[] = []) => {
    queries.push(sql);
    if (sql.startsWith("INSERT INTO settings"))
      weekly ??= structuredClone(args[1]) as Record<string, unknown>;
    if (sql.startsWith("SELECT value FROM settings"))
      return { rows: [{ value: structuredClone(weekly) }] };
    if (sql.startsWith("UPDATE settings"))
      weekly = structuredClone(args[1]) as Record<string, unknown>;
    if (sql.includes("count(DISTINCT lower(btrim(u.email)))"))
      return {
        rows: [
          { count: new Set(eligible().map((u) => u.email.toLowerCase())).size },
        ],
      };
    if (sql.startsWith("INSERT INTO email_campaigns"))
      campaigns.push({
        id: args[0] as string,
        kind: args[1] as string,
        subject: args[2] as string,
        body: args[3] as string,
        scheduled_at: args[5] as string | null,
        status: "queued",
        created_at: new Date(),
        finished_at: null,
        error: null,
      });
    if (sql.startsWith("INSERT INTO email_recipients")) {
      assert.match(sql, /NOT u\."isGuest" AND NOT u\.disabled/);
      assert.match(sql, /u\."emailVerified" = true/);
      assert.match(sql, /email_unsubscribes/);
      assert.match(sql, /invalid\|test\|example\|localhost/);
      const unique = new Map(eligible().map((u) => [u.email.toLowerCase(), u]));
      for (const [email, u] of unique)
        recipients.push({
          campaign_id: args[0] as string,
          user_id: u.id,
          email,
          status: "pending",
        });
    }
    if (sql.startsWith("SELECT c.*,")) {
      const rows = sql.includes("WHERE c.id=$1")
        ? campaigns.filter((c) => c.id === args[0])
        : [...campaigns].reverse();
      return { rows: rows.map(summary) };
    }
    if (sql.startsWith("SELECT pg_try_advisory_lock"))
      return { rows: [{ locked: lockAvailable }] };
    if (sql.startsWith("SELECT * FROM email_campaigns"))
      return {
        rows: campaigns
          .filter((c) => ["queued", "sending"].includes(c.status))
          .slice(0, 1),
      };
    if (sql.startsWith("UPDATE email_campaigns SET status='completed'")) {
      const c = campaigns.find((c) => c.id === args[0])!;
      if (!recipients.some((r) => r.campaign_id === c.id)) {
        c.status = "completed";
        c.finished_at = new Date();
      }
    } else if (sql.startsWith("UPDATE email_campaigns SET status='sending'"))
      campaigns.find((c) => c.id === args[0])!.status = "sending";
    else if (sql.startsWith("UPDATE email_campaigns SET\n")) {
      const c = campaigns.find((c) => c.id === args[0])!;
      const rows = recipients.filter((r) => r.campaign_id === c.id);
      const pending = rows.some((r) =>
        ["pending", "sending"].includes(r.status),
      );
      const failed = rows.some((r) => ["failed", "skipped"].includes(r.status));
      c.status = pending
        ? "sending"
        : failed
          ? "completed_with_errors"
          : "completed";
      c.finished_at = pending ? null : new Date();
      c.error = failed
        ? "Some recipients failed, were skipped, or have an unknown delivery outcome. No automatic retries."
        : null;
    }
    if (sql.startsWith("UPDATE email_recipients SET status='sending'")) {
      const recipient = recipients
        .filter((r) => r.campaign_id === args[0] && r.status === "pending")
        .sort((a, b) => a.email.localeCompare(b.email))[0];
      if (recipient) recipient.status = "sending";
      return { rows: recipient ? [recipient] : [] };
    }
    if (sql.startsWith("SELECT u.id FROM")) {
      assert.match(sql, /u\."emailVerified" = true/);
      return {
        rows: eligible().filter(
          (u) => u.id === args[0] && u.email.toLowerCase() === args[1],
        ),
      };
    }
    if (
      sql.startsWith("UPDATE email_recipients SET status=") &&
      !sql.startsWith("UPDATE email_recipients SET status='sending'")
    ) {
      const status = /SET status='([^']+)'/.exec(sql)![1];
      const selected = recipients.filter((r) =>
        sql.includes("WHERE status='sending'")
          ? r.status === "sending"
          : r.campaign_id === args[0] &&
            (sql.includes("AND email=$2")
              ? r.email === args[1] && r.status === "sending"
              : r.status === "pending"),
      );
      selected.forEach((r) => (r.status = status));
    }
    if (sql.startsWith("INSERT INTO email_unsubscribes"))
      unsubscribes.set(args[0] as string, args[1] as string);
    return { rows: [] };
  };
  t.mock.module("../server/db.ts", {
    namedExports: {
      db: { query, connect: async () => ({ query, release() {} }) },
    },
  });
  const messages: {
    to: { address: string };
    from: { address: string };
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
    cc?: unknown;
    bcc?: unknown;
  }[] = [];
  let smtpBehavior: "success" | "reject" | "fatal" | "defer" = "success";
  let releaseSend: (() => void) | undefined;
  let attempts = 0;
  t.mock.module("nodemailer", {
    defaultExport: {
      createTransport: (options: Record<string, unknown>) => {
        assert.equal(options.host, "smtp-relay.brevo.com");
        assert.equal(
          options.port,
          Number(process.env.BREVO_SMTP_PORT || "587"),
        );
        assert.equal(options.secure, process.env.BREVO_SMTP_PORT === "465");
        assert.equal(options.requireTLS, true);
        return {
          close() {},
          sendMail: async (message: (typeof messages)[number]) => {
            attempts++;
            if (smtpBehavior === "fatal")
              throw Object.assign(Error("private-secret-provider-response"), {
                code: "EAUTH",
              });
            if (smtpBehavior === "reject") {
              smtpBehavior = "success";
              throw Object.assign(
                Error("private-recipient-provider-response"),
                { code: "EENVELOPE", command: "RCPT TO", responseCode: 550 },
              );
            }
            if (smtpBehavior === "defer")
              await new Promise<void>((resolve) => {
                releaseSend = resolve;
              });
            messages.push(message);
            return { accepted: [message.to.address] };
          },
        };
      },
    },
  });
  const email = await import("../server/email");
  const initial = await email.getEmailDashboard();
  assert.equal(initial.recipientCount, 2);
  assert.equal(initial.weekly.nextRunAt, "2026-10-12T09:00:00.000Z");
  assert.equal(initial.weekly.enabled, true);
  assert.equal(initial.configured, true);
  assert.equal(
    email.communityEmailSchema.safeParse({
      subject: "Injected\r\nBcc: other@real-domain.com",
      body: "Body",
    }).success,
    false,
  );
  assert.equal(
    email.communityEmailSchema.safeParse({
      subject: "x".repeat(161),
      body: "Body",
    }).success,
    false,
  );
  assert.equal(
    email.weeklyEmailSchema.safeParse({
      ...initial.weekly,
      nextRunAt: undefined,
      dayOfWeek: 7,
    }).success,
    false,
  );
  delete process.env.BREVO_SMTP_LOGIN;
  await assert.rejects(
    email.queueCommunityEmail({ subject: "Hello", body: "Welcome" }, "admin"),
    (e: unknown) =>
      e instanceof email.EmailError &&
      e.status === 503 &&
      e.message.includes("BREVO_SMTP_LOGIN"),
  );
  process.env.BREVO_SMTP_LOGIN = "login@smtp-brevo.com";
  process.env.BREVO_SMTP_PORT = "1234";
  assert.deepEqual((await email.getEmailDashboard()).missing, [
    "BREVO_SMTP_PORT",
  ]);
  await assert.rejects(
    email.queueCommunityEmail({ subject: "Hello", body: "Welcome" }, "admin"),
    /BREVO_SMTP_PORT/,
  );
  delete process.env.BREVO_SMTP_PORT;

  const first = await email.queueCommunityEmail(
    {
      subject: "Hello community",
      body: '<script>alert("x")</script>\nWe miss you.',
    },
    "admin",
  );
  assert.equal(
    recipients.some((r) => r.user_id === "unverified"),
    false,
  );
  await Promise.all([email.runEmailJobs(), email.runEmailJobs()]);
  assert.equal(messages.length, 2);
  assert.equal(
    campaigns.length,
    1,
    "first initialization must not trigger an immediate weekly blast",
  );
  for (const message of messages) {
    assert.equal(message.cc, undefined);
    assert.equal(message.bcc, undefined);
    assert.equal(typeof message.to.address, "string");
    assert.equal(message.html.includes("<script>"), false);
    assert.ok(message.html.includes("&lt;script&gt;"));
    assert.equal(
      message.headers["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
  }
  assert.equal(summary(campaigns.find((c) => c.id === first.id)!).sent, 2);
  const token = new URL(
    messages
      .find((m) => m.to.address.startsWith("alice@"))!
      .headers["List-Unsubscribe"].slice(1, -1),
  ).searchParams.get("token")!;
  assert.match(email.emailUnsubscribePage(token), /method="post"/);
  assert.equal(unsubscribes.size, 0, "GET must only show confirmation");
  assert.throws(() => email.emailUnsubscribePage(token + "x"), /invalid/);
  await assert.rejects(
    email.unsubscribeCommunityEmail(
      token.replace(/^./, token[0] === "a" ? "b" : "a"),
    ),
    /invalid/,
  );
  const beforeOptout = await email.queueCommunityEmail(
    { subject: "Second", body: "Join us" },
    "admin",
  );
  await email.unsubscribeCommunityEmail(token);
  await email.unsubscribeCommunityEmail(token);
  await email.runEmailJobs();
  assert.equal(
    summary(campaigns.find((c) => c.id === beforeOptout.id)!).sent,
    1,
  );
  assert.equal(
    summary(campaigns.find((c) => c.id === beforeOptout.id)!).failed,
    1,
  );
  assert.equal(
    (await email.getEmailDashboard()).recipientCount,
    1,
    "shared address remains opted out",
  );

  const verificationChanged = await email.queueCommunityEmail(
    { subject: "Verification changed", body: "Join us" },
    "admin",
  );
  const bob = users.find((u) => u.id === "bob")!;
  bob.emailVerified = false;
  assert.equal((await email.getEmailDashboard()).recipientCount, 0);
  const beforeVerificationCheck = messages.length;
  await email.runEmailJobs();
  assert.equal(messages.length, beforeVerificationCheck);
  assert.equal(
    summary(campaigns.find((c) => c.id === verificationChanged.id)!).failed,
    1,
    "verification is checked again immediately before sending",
  );
  bob.emailVerified = true;

  t.mock.timers.setTime(Date.UTC(2026, 9, 12, 9));
  await email.runEmailJobs();
  await email.runEmailJobs();
  assert.equal(campaigns.filter((c) => c.kind === "weekly").length, 1);
  assert.equal(weekly!.nextRunAt, "2026-10-19T09:00:00.000Z");
  assert.ok(queries.some((sql) => sql.includes("FOR UPDATE")));
  assert.ok(queries.some((sql) => sql.includes("pg_try_advisory_lock")));
  const saved = await email.saveWeeklyEmail({
    enabled: true,
    dayOfWeek: 1,
    hourUtc: 9,
    subject: "New weekly subject",
    body: "New weekly body",
  });
  assert.equal(
    saved.weekly.nextRunAt,
    "2026-10-19T09:00:00.000Z",
    "copy changes keep schedule persistent",
  );
  const rescheduled = await email.saveWeeklyEmail({
    enabled: false,
    dayOfWeek: 3,
    hourUtc: 11,
    subject: "Weekly",
    body: "Welcome back",
  });
  assert.equal(rescheduled.weekly.nextRunAt, "2026-10-14T11:00:00.000Z");

  users.push({
    id: "charlie",
    email: "charlie@real-domain.com",
    emailVerified: true,
    isGuest: false,
    disabled: false,
  });
  process.env.BREVO_SMTP_PORT = "2525";
  const rejected = await email.queueCommunityEmail(
    { subject: "Mailbox test", body: "Hello" },
    "admin",
  );
  smtpBehavior = "reject";
  await email.runEmailJobs();
  assert.equal(summary(campaigns.find((c) => c.id === rejected.id)!).sent, 1);
  assert.equal(
    summary(campaigns.find((c) => c.id === rejected.id)!).failed,
    1,
    "a bad mailbox must not stop other players",
  );
  const failed = await email.queueCommunityEmail(
    { subject: "Provider test", body: "Hello" },
    "admin",
  );
  const later = await email.queueCommunityEmail(
    { subject: "Next campaign", body: "Hello" },
    "admin",
  );
  const attemptsBeforeFatal = attempts;
  smtpBehavior = "fatal";
  await email.runEmailJobs();
  assert.equal(attempts - attemptsBeforeFatal, 1);
  assert.equal(summary(campaigns.find((c) => c.id === failed.id)!).failed, 2);
  assert.equal(campaigns.find((c) => c.id === later.id)!.status, "queued");
  assert.equal(
    JSON.stringify(await email.getEmailDashboard()).includes("private-secret"),
    false,
  );
  smtpBehavior = "success";
  await email.runEmailJobs();
  assert.equal(campaigns.find((c) => c.id === later.id)!.status, "completed");

  const interrupted = await email.queueCommunityEmail(
    { subject: "Interrupted test", body: "Hello" },
    "admin",
  );
  recipients.find((r) => r.campaign_id === interrupted.id)!.status = "sending";
  campaigns.find((c) => c.id === interrupted.id)!.status = "sending";
  const beforeRecovery = attempts;
  await email.runEmailJobs();
  assert.equal(
    attempts - beforeRecovery,
    1,
    "interrupted recipient must never be retried",
  );
  assert.equal(
    summary(campaigns.find((c) => c.id === interrupted.id)!).failed,
    1,
  );
  assert.equal(
    campaigns.find((c) => c.id === interrupted.id)!.status,
    "completed_with_errors",
  );

  for (let i = 0; i < 103; i++)
    users.push({
      id: `bulk${i}`,
      email: `bulk${i}@real-domain.com`,
      emailVerified: true,
      isGuest: false,
      disabled: false,
    });
  const batch = await email.queueCommunityEmail(
    { subject: "Batch test", body: "Hello" },
    "admin",
  );
  const beforeBatch = attempts;
  lockAvailable = false;
  await email.runEmailJobs();
  assert.equal(attempts, beforeBatch);
  lockAvailable = true;
  await email.runEmailJobs();
  assert.equal(attempts - beforeBatch, 100);
  assert.equal(campaigns.find((c) => c.id === batch.id)!.status, "sending");
  await email.runEmailJobs();
  assert.equal(summary(campaigns.find((c) => c.id === batch.id)!).sent, 105);

  await email.queueCommunityEmail(
    { subject: "Shutdown test", body: "Hello" },
    "admin",
  );
  smtpBehavior = "defer";
  const active = email.runEmailJobs();
  await setImmediate();
  let shutdownFinished = false;
  const shutdown = email.stopEmailJobs().then(() => {
    shutdownFinished = true;
  });
  await setImmediate();
  assert.equal(shutdownFinished, false);
  releaseSend!();
  await Promise.all([active, shutdown]);
  const afterShutdown = attempts;
  await email.runEmailJobs();
  assert.equal(attempts, afterShutdown);
});
