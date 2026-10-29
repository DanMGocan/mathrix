import Stripe from "stripe";
import type { PoolClient } from "pg";
import { db } from "./db";

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PREMIUM_PRICE_ID,
  );
}
let client: Stripe | undefined;
function stripe() {
  if (!billingConfigured())
    throw new BillingError("Premium subscriptions are not available yet.");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 2,
    timeout: 10000,
  }));
}
type Billing = {
  user_id: string;
  customer_id: string | null;
  subscription_id: string | null;
  checkout_id: string | null;
  status: string;
  paid_until: Date | null;
  cancel_at_period_end: boolean;
};

async function locked<T>(
  userId: string,
  work: (c: PoolClient, row: Billing) => Promise<T>,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "INSERT INTO billing(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [userId],
    );
    const row = (
      await c.query("SELECT * FROM billing WHERE user_id=$1 FOR UPDATE", [
        userId,
      ])
    ).rows[0] as Billing;
    const result = await work(c, row);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function billingSummary(userId: string) {
  const row = (
    await db.query(
      "SELECT status,paid_until,cancel_at_period_end FROM billing WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  return {
    configured: billingConfigured(),
    status: row?.status || "none",
    paidUntil: row?.paid_until || null,
    cancelAtPeriodEnd: row?.cancel_at_period_end || false,
  };
}

async function portal(customer: string) {
  return stripe().billingPortal.sessions.create({
    customer,
    return_url: `${process.env.APP_URL || "http://localhost:3000"}/profile`,
  });
}
export async function billingPortal(userId: string) {
  const row = (
    await db.query("SELECT customer_id FROM billing WHERE user_id=$1", [userId])
  ).rows[0];
  if (!row?.customer_id)
    throw new BillingError("No billing account exists yet.", 409);
  return { url: (await portal(row.customer_id)).url };
}

export async function checkout(userId: string) {
  const api = stripe();
  const price = await api.prices.retrieve(process.env.STRIPE_PREMIUM_PRICE_ID!);
  if (
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== 499 ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.tax_behavior !== "inclusive"
  )
    throw new BillingError("Premium pricing is not configured correctly.");
  // Store the customer before checkout so a fast webhook can always identify it.
  await locked(userId, async (c, row) => {
    if (row.customer_id) return;
    const user = (
      await c.query('SELECT email FROM "user" WHERE id=$1', [userId])
    ).rows[0];
    const customer = await api.customers.create(
      { email: user.email, metadata: { mathrixUserId: userId } },
      { idempotencyKey: `mathrix-customer-${userId}` },
    );
    await c.query("UPDATE billing SET customer_id=$2 WHERE user_id=$1", [
      userId,
      customer.id,
    ]);
  });
  return locked(userId, async (c, row) => {
    const subscriptions = await api.subscriptions.list({
      customer: row.customer_id!,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      return { url: (await portal(row.customer_id!)).url };
    const sessions = await api.checkout.sessions.list({
      customer: row.customer_id!,
      limit: 1,
    });
    const last = sessions.data[0];
    if (last?.status === "open" && last.url) {
      await c.query(
        "UPDATE billing SET checkout_id=$2,updated_at=now() WHERE user_id=$1",
        [userId, last.id],
      );
      return { url: last.url };
    }
    // A stable key also covers a timeout after Stripe created the session.
    const session = await api.checkout.sessions.create(
      {
        mode: "subscription",
        customer: row.customer_id!,
        client_reference_id: userId,
        subscription_data: { metadata: { mathrixUserId: userId } },
        line_items: [{ price: price.id, quantity: 1 }],
        allowed_payment_method_types: ["card"],
        allow_promotion_codes: false,
        adaptive_pricing: { enabled: false },
        success_url: `${process.env.APP_URL || "http://localhost:3000"}/profile?billing=pending`,
        cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/profile?billing=cancelled`,
      },
      {
        idempotencyKey: `mathrix-checkout-${userId}-${last?.id || row.checkout_id || "first"}`,
      },
    );
    await c.query(
      "UPDATE billing SET checkout_id=$2,updated_at=now() WHERE user_id=$1",
      [userId, session.id],
    );
    return { url: session.url! };
  });
}

export function paidThrough(
  invoice: Stripe.Invoice,
  subscriptionId: string,
  priceId: string,
) {
  if (
    invoice.status !== "paid" ||
    invoice.parent?.subscription_details?.subscription !== subscriptionId
  )
    return 0;
  return Math.max(
    0,
    ...invoice.lines.data
      .filter(
        (line) =>
          line.pricing?.price_details?.price === priceId &&
          !line.parent?.subscription_item_details?.proration,
      )
      .map((line) => line.period.end),
  );
}

export async function processBillingEvent(event: Stripe.Event) {
  const supported = [
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ];
  if (!supported.includes(event.type)) return;
  const object = event.data.object as {
    customer?: string | { id: string };
    id: string;
  };
  const customerId =
    typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customerId) return;
  const owner = (
    await db.query("SELECT user_id FROM billing WHERE customer_id=$1", [
      customerId,
    ])
  ).rows[0];
  if (!owner) return;
  await locked(owner.user_id, async (c, row) => {
    const api = stripe();
    // Fetch current state under the account lock: repeated/old events cannot roll it back.
    const subscriptions = await api.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const sub = subscriptions.data
      .filter((s) =>
        s.items.data.some(
          (item) => item.price.id === process.env.STRIPE_PREMIUM_PRICE_ID,
        ),
      )
      .sort((a, b) => b.created - a.created)[0];
    if (!sub) {
      await c.query(
        "UPDATE billing SET status='none',paid_until=NULL,cancel_at_period_end=false,updated_at=now() WHERE user_id=$1",
        [row.user_id],
      );
      return;
    }
    let until =
      row.subscription_id === sub.id
        ? (row.paid_until?.getTime() || 0) / 1000
        : 0;
    const invoiceIds = new Set<string>();
    if (sub.latest_invoice)
      invoiceIds.add(
        typeof sub.latest_invoice === "string"
          ? sub.latest_invoice
          : sub.latest_invoice.id,
      );
    if (event.type === "invoice.paid") invoiceIds.add(object.id);
    for (const id of invoiceIds) {
      const invoice = await api.invoices.retrieve(id);
      // Invoice line periods, not the subscription's unpaid upcoming period, grant access.
      until = Math.max(
        until,
        paidThrough(invoice, sub.id, process.env.STRIPE_PREMIUM_PRICE_ID!),
      );
    }
    await c.query(
      "UPDATE billing SET subscription_id=$2,status=$3,paid_until=$4,cancel_at_period_end=$5,updated_at=now() WHERE user_id=$1",
      [
        row.user_id,
        sub.id,
        sub.status,
        until ? new Date(until * 1000) : null,
        sub.cancel_at_period_end || sub.cancel_at !== null,
      ],
    );
  });
}

export function verifyBillingEvent(raw: Buffer, signature: string) {
  try {
    return stripe().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (e) {
    if (e instanceof BillingError) throw e;
    throw new BillingError("Invalid Stripe signature.", 400);
  }
}
