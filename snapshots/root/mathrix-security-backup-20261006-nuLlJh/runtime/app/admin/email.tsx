"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type WeeklyEmail = {
  enabled: boolean;
  dayOfWeek: number;
  hourUtc: number;
  subject: string;
  body: string;
};
type EmailDashboard = {
  configured: boolean;
  missing: string[];
  recipientCount: number;
  weekly: WeeklyEmail & { nextRunAt: string | null };
  campaigns: {
    id: string;
    kind: "manual" | "weekly";
    subject: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
    createdAt: string;
    finishedAt: string | null;
    error?: string | null;
  }[];
};
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const setupLabels: Record<string, string> = {
  BREVO_SMTP_KEY: "Brevo SMTP key",
  BREVO_SMTP_LOGIN: "Brevo SMTP login",
  BREVO_FROM_EMAIL: "verified sender address",
  AUTH_SECRET: "unsubscribe link security",
  APP_URL: "public website address",
};
const utcTime = (at: string) =>
  new Date(at).toLocaleString(undefined, {
    timeZone: "UTC",
    timeZoneName: "short",
  });

export default function Emails() {
  const [data, setData] = useState<EmailDashboard | null>(null);
  const [weekly, setWeekly] = useState<WeeklyEmail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "send" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const value = await api<EmailDashboard>("/api/admin/email");
      setData(value);
      setWeekly((current) => current ?? value.weekly);
      setError("");
    } catch (e) {
      setError(`Could not refresh emails: ${(e as Error).message}`);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const active = data?.campaigns.some((campaign) =>
    ["queued", "sending"].includes(campaign.status),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!weekly || busy || loading) return;
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const value = await api<EmailDashboard>("/api/admin/email", {
        enabled: weekly.enabled,
        dayOfWeek: weekly.dayOfWeek,
        hourUtc: weekly.hourUtc,
        subject: weekly.subject,
        body: weekly.body,
      });
      setData(value);
      setWeekly(value.weekly);
      setMessage("Weekly reminder saved.");
    } catch (e) {
      setError(`Could not save the reminder: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !data?.configured || !data.recipientCount) return;
    if (
      !window.confirm(
        `Send “${subject.trim()}” to all ${data.recipientCount.toLocaleString()} eligible players? This email will be queued for delivery.`,
      )
    )
      return;
    setBusy("send");
    setError("");
    setMessage("");
    try {
      await api("/api/admin/email/send", { subject, body });
      setSubject("");
      setBody("");
      setMessage(
        "Community email queued. Track delivery in the history below.",
      );
      await load();
    } catch (e) {
      setError(`Could not queue the email: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h2>Community emails</h2>
      <div className="admin-tools">
        <button onClick={() => void load()} disabled={loading || !!busy}>
          Refresh emails
        </button>
        <span role="status">{loading ? "Loading emails…" : message}</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error} Try again or refresh emails.
        </p>
      )}
      {data && weekly && (
        <>
          {data.configured ? (
            <p>Email sending is ready.</p>
          ) : (
            <p role="alert">
              <strong>Email sending needs setup.</strong> Missing or invalid:{" "}
              {[
                ...new Set(
                  data.missing.map(
                    (key) => setupLabels[key] ?? "email settings",
                  ),
                ),
              ].join(", ")}
              . Complete the server email configuration, then refresh emails.
            </p>
          )}
          <p>
            Emails reach {data.recipientCount.toLocaleString()} registered
            players with valid email addresses. Guests, suspended players, and
            players who unsubscribed are excluded. Every email includes a Play
            Mathrix link and an unsubscribe link.
          </p>
          <form className="panel" onSubmit={save}>
            <h3>Weekly reminder</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={weekly.enabled}
                disabled={!!busy}
                onChange={(e) =>
                  setWeekly({ ...weekly, enabled: e.target.checked })
                }
              />
              Enable weekly reminder
            </label>
            <div className="filter-grid">
              <label>
                Send day
                <select
                  value={weekly.dayOfWeek}
                  disabled={!!busy}
                  onChange={(e) =>
                    setWeekly({ ...weekly, dayOfWeek: Number(e.target.value) })
                  }
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Send hour (UTC)
                <select
                  value={weekly.hourUtc}
                  disabled={!!busy}
                  onChange={(e) =>
                    setWeekly({ ...weekly, hourUtc: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00 UTC
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Weekly email subject
              <input
                value={weekly.subject}
                maxLength={160}
                required
                disabled={!!busy}
                onChange={(e) =>
                  setWeekly({ ...weekly, subject: e.target.value })
                }
              />
            </label>
            <label>
              Weekly email message
              <textarea
                value={weekly.body}
                rows={5}
                maxLength={10000}
                required
                disabled={!!busy}
                onChange={(e) => setWeekly({ ...weekly, body: e.target.value })}
              />
            </label>
            <p>
              {data.weekly.enabled && data.weekly.nextRunAt
                ? `Next scheduled reminder: ${utcTime(data.weekly.nextRunAt)}.`
                : "Weekly reminders are paused."}
              {!data.configured &&
                " Delivery will wait until setup is complete."}{" "}
              Changes take effect when you save.
            </p>
            <button className="primary" disabled={!!busy || loading}>
              {busy === "save" ? "Saving…" : "Save weekly reminder"}
            </button>
          </form>
          <form className="panel" onSubmit={send}>
            <h3>Send a community email</h3>
            <label>
              Manual email subject
              <input
                value={subject}
                maxLength={160}
                required
                disabled={!!busy}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Manual email message
              <textarea
                value={body}
                rows={6}
                maxLength={10000}
                required
                disabled={!!busy}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <p>
              Write plain text. You will confirm the recipient count before
              sending.
            </p>
            <button
              className="primary"
              disabled={
                !!busy || loading || !data.configured || !data.recipientCount
              }
            >
              {busy === "send"
                ? "Queueing email…"
                : `Send to ${data.recipientCount.toLocaleString()} players`}
            </button>
            {!data.recipientCount && <p>No eligible players to email yet.</p>}
          </form>
          <h3>Email history</h3>
          {active && <p>Delivery progress refreshes every five seconds.</p>}
          {data.campaigns.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Created (UTC)</th>
                    <th scope="col">Status</th>
                    <th scope="col">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td style={{ overflowWrap: "anywhere" }}>
                        <b>{campaign.subject}</b>
                        <small>
                          {campaign.kind === "weekly"
                            ? "Weekly reminder"
                            : "Manual email"}
                        </small>
                      </td>
                      <td>{utcTime(campaign.createdAt)}</td>
                      <td>
                        {campaign.status.replaceAll("_", " ")}
                        {campaign.finishedAt && (
                          <small>Finished {utcTime(campaign.finishedAt)}</small>
                        )}
                      </td>
                      <td>
                        {campaign.sent.toLocaleString()} /{" "}
                        {campaign.total.toLocaleString()} sent
                        <small>{campaign.failed.toLocaleString()} failed</small>
                        {campaign.error && (
                          <small className="error">{campaign.error}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No community emails have been sent yet.</p>
          )}
        </>
      )}
    </>
  );
}
