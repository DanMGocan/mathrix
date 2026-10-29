import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { profileSchema, countryFlag, avatarURL } from "../lib/profile";
import { createGame, startGame, finishGame } from "../lib/engine";

test("profile validation and Premium cosmetics preserve game outcomes", () => {
  const input = {
    username: "Noether_42",
    city: "Berlin",
    countryCode: "DE",
    avatarId: "robot-24",
  };
  assert.deepEqual(profileSchema.parse(input), input);
  for (const patch of [
    { username: "aa" },
    { username: "<script>" },
    { countryCode: "ZZ" },
    { city: "x".repeat(81) },
    { avatarId: "https://attacker.invalid/a.svg" },
    { premium: true },
  ])
    assert.equal(
      profileSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
  assert.equal(countryFlag("DE"), "🇩🇪");
  assert.equal(avatarURL("../../other"), "/avatars/robot-01.svg");
  const players = [
    { id: "a", name: "A", registered: true },
    { id: "b", name: "B", registered: true },
  ];
  const games = [
    players,
    players.map((p) => ({ ...p, premium: true, avatarId: "robot-24" })),
  ].map((p) => createGame("match", 42, p, undefined, 1000));
  for (const g of games) {
    startGame(g, 2000);
    finishGame(g, 3000);
  }
  assert.deepEqual(games[0].cards, games[1].cards);
  assert.deepEqual(games[0].initialMatrices, games[1].initialMatrices);
  assert.equal(games[0].active, games[1].active);
  assert.deepEqual(games[0].result, games[1].result);
});

test("billing verifies payment, reuses checkout and reconciles duplicate/old events", async (t) => {
  const keys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PREMIUM_PRICE_ID",
  ];
  const previous = keys.map((k) => process.env[k]);
  t.after(() =>
    keys.forEach((k, i) =>
      previous[i] === undefined
        ? delete process.env[k]
        : (process.env[k] = previous[i]),
    ),
  );
  keys.forEach((k) => delete process.env[k]);
  const signer = new Stripe("sk_test_local_only");
  const row = {
    user_id: "u1",
    customer_id: null as string | null,
    subscription_id: null as string | null,
    checkout_id: null as string | null,
    status: "none",
    paid_until: null as Date | null,
    cancel_at_period_end: false,
  };
  let creates = 0;
  const open: { id: string; url: string; status: string }[] = [];
  let subscriptions: unknown[] = [];
  const invoice = {
    id: "in_paid",
    status: "paid",
    parent: { subscription_details: { subscription: "sub_1" } },
    lines: {
      data: [
        {
          pricing: { price_details: { price: "price_premium" } },
          parent: { subscription_item_details: { proration: false } },
          period: { start: 100, end: 200 },
        },
      ],
    },
  };
  const invoices: Record<string, unknown> = {
    in_paid: invoice,
    in_failed: {
      ...invoice,
      id: "in_failed",
      status: "open",
      lines: {
        data: [{ ...invoice.lines.data[0], period: { start: 200, end: 300 } }],
      },
    },
  };
  const fake = {
    webhooks: signer.webhooks,
    prices: {
      retrieve: async () => ({
        id: "price_premium",
        active: true,
        currency: "eur",
        unit_amount: 499,
        tax_behavior: "inclusive",
        recurring: { interval: "month", interval_count: 1 },
      }),
    },
    customers: { create: async () => ({ id: "cus_1" }) },
    subscriptions: { list: async () => ({ data: subscriptions }) },
    invoices: { retrieve: async (id: string) => invoices[id] },
    checkout: {
      sessions: {
        list: async () => ({ data: open }),
        create: async (
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => {
          assert.equal(params.mode, "subscription");
          assert.deepEqual(params.line_items, [
            { price: "price_premium", quantity: 1 },
          ]);
          assert.ok(options.idempotencyKey);
          creates++;
          const result = {
            id: "cs_1",
            status: "open",
            url: "https://checkout.stripe.com/test",
          };
          open.push(result);
          return result;
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: { customer: string }) => {
          assert.equal(params.customer, "cus_1");
          return { url: "https://billing.stripe.com/test" };
        },
      },
    },
  };
  t.mock.module("stripe", {
    defaultExport: function () {
      return fake;
    },
  });
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("UPDATE billing SET customer_id"))
      row.customer_id = args[1] as string;
    if (sql.startsWith("UPDATE billing SET checkout_id"))
      row.checkout_id = args[1] as string;
    if (sql.startsWith("UPDATE billing SET subscription_id"))
      Object.assign(row, {
        subscription_id: args[1],
        status: args[2],
        paid_until: args[3],
        cancel_at_period_end: args[4],
      });
    if (sql.includes('SELECT email FROM "user"'))
      return { rows: [{ email: "test@example.invalid" }] };
    return { rows: [row] };
  };
  t.mock.module("../server/db.ts", {
    namedExports: {
      db: { query, connect: async () => ({ query, release() {} }) },
      redis: new Proxy(
        {},
        {
          get: () => () => {
            throw Error("Premium must not access ad counters");
          },
        },
      ),
    },
  });
  const billing = await import("../server/billing");
  await assert.rejects(billing.checkout("u1"), /not available/);
  process.env.STRIPE_SECRET_KEY = "sk_test_local_only";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_only";
  process.env.STRIPE_PREMIUM_PRICE_ID = "price_premium";
  assert.deepEqual(await billing.checkout("u1"), await billing.checkout("u1"));
  assert.equal(creates, 1);
  assert.equal(
    Boolean(row.paid_until),
    false,
    "checkout redirect must not activate benefits",
  );
  const sub = {
    id: "sub_1",
    created: 1,
    status: "active",
    items: { data: [{ price: { id: "price_premium" } }] },
    latest_invoice: "in_paid",
    cancel_at_period_end: false,
    cancel_at: null,
  };
  subscriptions = [sub];
  const event = {
    id: "evt_1",
    type: "invoice.paid",
    data: { object: { id: "in_paid", customer: "cus_1" } },
  } as Stripe.Event;
  const raw = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({
    payload: raw,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  assert.equal(
    billing.verifyBillingEvent(Buffer.from(raw), signature).id,
    event.id,
  );
  assert.throws(
    () => billing.verifyBillingEvent(Buffer.from(raw + " "), signature),
    /signature/,
  );
  await billing.processBillingEvent(event);
  assert.equal(row.paid_until?.getTime(), 200000);
  await billing.processBillingEvent(event);
  assert.equal(row.paid_until?.getTime(), 200000);
  sub.status = "past_due";
  sub.latest_invoice = "in_failed";
  await billing.processBillingEvent({
    ...event,
    type: "invoice.payment_failed",
    data: { object: { id: "in_failed", customer: "cus_1" } },
  } as Stripe.Event);
  assert.equal(
    row.paid_until?.getTime(),
    200000,
    "unpaid next period must not extend access",
  );
  sub.status = "active";
  (invoices.in_failed as { status: string }).status = "paid";
  await billing.processBillingEvent({
    ...event,
    data: { object: { id: "in_failed", customer: "cus_1" } },
  } as Stripe.Event);
  assert.equal(
    row.paid_until?.getTime(),
    300000,
    "successful renewal extends paid access",
  );
  await billing.processBillingEvent({
    ...event,
    type: "invoice.payment_failed",
  } as Stripe.Event);
  assert.equal(
    row.status,
    "active",
    "old failure cannot undo current active state",
  );
  await billing.processBillingEvent(event);
  assert.equal(
    row.paid_until?.getTime(),
    300000,
    "an old paid invoice cannot shorten renewed access",
  );
  assert.equal(
    (await billing.checkout("u1")).url,
    "https://billing.stripe.com/test",
  );
  assert.equal(
    creates,
    1,
    "existing subscriptions must not be purchased twice",
  );
  sub.cancel_at_period_end = true;
  await billing.processBillingEvent({
    ...event,
    type: "customer.subscription.updated",
  } as Stripe.Event);
  assert.equal(row.cancel_at_period_end, true);
  assert.equal(row.paid_until?.getTime(), 300000);
  sub.status = "canceled";
  await billing.processBillingEvent({
    ...event,
    type: "customer.subscription.deleted",
  } as Stripe.Event);
  assert.equal(row.status, "canceled");
  assert.equal(
    billing.paidThrough(
      invoice as unknown as Stripe.Invoice,
      "sub_other",
      "price_premium",
    ),
    0,
  );
  assert.equal(
    billing.paidThrough(
      invoice as unknown as Stripe.Invoice,
      "sub_1",
      "price_other",
    ),
    0,
  );
  const { adFor, recordImpression } = await import("../server/ads");
  const { defaultAds } = await import("../lib/config");
  const premium = {
    id: "u1",
    name: "Premium",
    role: "USER",
    registered: true,
    premium: true,
  };
  assert.deepEqual(await adFor(premium, "match", defaultAds, true), {
    kind: "none",
    durationMs: 0,
  });
  await recordImpression(premium, "match", { kind: "house", durationMs: 1000 });
});
