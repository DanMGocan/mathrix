"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { SessionStatus, useSession } from "@/lib/session";
import { GuestAccount, GuestRestore } from "../guest-account";
import { matchLabel } from "@/lib/config";
import {
  avatars,
  avatarURL,
  countries,
  countryFlag,
  type PlayerAppearance,
  type ProfileInput,
} from "@/lib/profile";
import PlayerIdentity from "../player-identity";
type Profile = PlayerAppearance & {
  registered: boolean;
  name: string;
  username: string | null;
  billing: {
    configured: boolean;
    status: string;
    paidUntil: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  rating: number;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  highest_score: number;
  total_score: number;
  history: {
    id: string;
    opponent: string;
    result: string;
    score: number;
    opponent_score: number;
    ended_at: string;
    rated: boolean;
    mode: string;
    speed: number;
    rating_before: number;
    rating_after: number;
  }[];
};
export default function ProfilePage() {
  const { me, loading } = useSession();
  if (loading)
    return (
      <section className="narrow">
        <SessionStatus />
      </section>
    );
  if (!me)
    return (
      <section className="narrow">
        <h1>Your profile</h1>
        <p>
          Sign in or restore your guest to see your profile and match history.
        </p>
        <Link className="button" href="/auth">
          Sign in
        </Link>
        <GuestRestore destination="/profile" />
      </section>
    );
  if (me.importPending)
    return (
      <section className="narrow">
        <h1>Finish account creation</h1>
        <Link className="button" href="/auth/complete">
          Finish guest import
        </Link>
      </section>
    );
  return <PlayerProfile key={me.id} />;
}
function PlayerProfile() {
  const { refresh } = useSession();
  const [p, setP] = useState<Profile | null>(null),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const pending =
      new URLSearchParams(location.search).get("billing") === "pending";
    if (pending)
      setBillingMessage(
        "Confirming your payment… Premium activates after payment verification.",
      );
    const load = () =>
      api<Profile>("/api/profile")
        .then((profile) => {
          if (disposed) return;
          setP(profile);
          if (pending && profile.premium) {
            setBillingMessage("Premium is active. Enjoy your golden glow!");
            history.replaceState(null, "", "/profile");
            void refresh().catch(() => {});
          } else if (pending && ++attempts < 15) timer = setTimeout(load, 2000);
          else if (pending)
            setBillingMessage(
              "Payment confirmation is still pending. Use Refresh status in a moment.",
            );
        })
        .catch(() => {
          if (!disposed)
            setError("Could not load your profile. Please try again.");
        });
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [retry, refresh]);
  async function billing(action: "checkout" | "portal") {
    setBillingBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`/api/billing/${action}`, {});
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBillingBusy(false);
    }
  }
  if (!p)
    return (
      <section className="narrow">
        <h1>Your profile</h1>
        <p>{error || "Loading…"}</p>
        {error && (
          <button
            onClick={() => {
              setError("");
              setRetry(retry + 1);
            }}
          >
            Retry profile
          </button>
        )}
      </section>
    );
  return (
    <section className="page">
      <div className="eyebrow">PLAYER PROFILE</div>
      <h1>
        <PlayerIdentity player={p} />
      </h1>
      {p.registered ? (
        <ProfileEditor
          profile={p}
          onSaved={(value) => {
            setP(value);
            void refresh().catch(() => {});
          }}
        />
      ) : (
        <>
          <GuestAccount />
          <p>
            Create an account to choose your username, location and robot
            avatar.
          </p>
        </>
      )}
      <article className={`premium-panel${p.premium ? " is-premium" : ""}`}>
        <div>
          <div className="eyebrow">MATHRIX PREMIUM</div>
          <h2>{p.premium ? "Your golden glow is active" : "Make it golden"}</h2>
        </div>
        <p className="premium-price">
          €4.99 <small>/ month</small>
        </p>
        <p>
          A golden avatar frame, a golden name and no pregame ads. Enjoy math
          facts while your opponent gets ready.
        </p>
        <p>
          <strong>Style, never an advantage.</strong> The same rules, cards and
          matchmaking for everyone.
        </p>
        {p.billing?.paidUntil && (
          <p>
            {p.billing.cancelAtPeriodEnd
              ? "Premium ends"
              : p.premium
                ? "Paid through"
                : "Last paid period ended"}{" "}
            {new Date(p.billing.paidUntil).toLocaleDateString()}.
          </p>
        )}
        {p.billing?.status === "past_due" && (
          <p>
            Payment needs attention. Benefits end when your paid time runs out.
          </p>
        )}
        <div className="actions">
          {!p.registered ? (
            <Link className="button primary" href="/auth?signup=1">
              Create an account
            </Link>
          ) : (
            <>
              {(!p.billing ||
                ["none", "canceled", "incomplete_expired"].includes(
                  p.billing.status,
                )) && (
                <button
                  className="primary"
                  disabled={billingBusy || !p.billing?.configured}
                  onClick={() => void billing("checkout")}
                >
                  Get Premium · €4.99/month
                </button>
              )}
              {p.billing && p.billing.status !== "none" && (
                <button
                  disabled={billingBusy || !p.billing.configured}
                  onClick={() => void billing("portal")}
                >
                  Manage subscription
                </button>
              )}
              <button
                disabled={billingBusy}
                onClick={() => setRetry((n) => n + 1)}
              >
                Refresh status
              </button>
            </>
          )}
        </div>
        {p.registered && !p.billing?.configured && (
          <p className="muted">Subscriptions are not available yet.</p>
        )}
        {billingMessage && <p role="status">{billingMessage}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <small>
          Renews monthly. Cancel any time; keep benefits through your paid
          period.
        </small>
      </article>
      <p>
        Only Ranked games change your rating. Overall stats include Casual and
        custom rooms.
      </p>
      <div className="stat-grid">
        {[
          ["Rating", p.rating],
          ["Rank", `#${p.rank}`],
          ["Matches", p.played],
          ["Wins", p.wins],
          ["Losses", p.losses],
          ["Draws", p.draws],
          [
            "Win rate",
            `${p.played ? Math.round((p.wins / p.played) * 100) : 0}%`,
          ],
          ["Win streak", p.streak],
          ["Highest score", p.highest_score],
          [
            "Average score",
            p.played ? (Number(p.total_score) / p.played).toFixed(1) : 0,
          ],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <h2>Recent matches</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Opponent</th>
              <th>Mode</th>
              <th>Result</th>
              <th>Score</th>
              <th>Rating</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {p.history.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/matches/${m.id}`}>{m.opponent}</Link>
                </td>
                <td>{matchLabel(m.mode, m.speed)}</td>
                <td>{m.result}</td>
                <td>
                  {m.score} : {m.opponent_score}
                </td>
                <td>
                  {m.rated
                    ? `${m.rating_after - m.rating_before >= 0 ? "+" : ""}${m.rating_after - m.rating_before}`
                    : "Unrated"}
                </td>
                <td>{new Date(m.ended_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  const initial = (): ProfileInput => ({
    username: profile.username || profile.name,
    city: profile.city || "",
    countryCode: profile.countryCode || "",
    avatarId: profile.avatarId || "robot-01",
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (!editing)
    return (
      <div className="profile-edit-action">
        <button
          onClick={() => {
            setDraft(initial());
            setError("");
            setSaved(false);
            setEditing(true);
          }}
        >
          Edit profile
        </button>
        {saved && <span role="status">Profile saved.</span>}
      </div>
    );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await api<Profile>("/api/profile", draft));
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="profile-editor" onSubmit={save}>
      <h2>Your player identity</h2>
      <PlayerIdentity
        player={{ ...draft, name: draft.username, premium: profile.premium }}
      />
      <div className="profile-fields">
        <label>
          Username
          <input
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_\-]{3,24}"
            autoComplete="nickname"
            aria-describedby="handle-help"
          />
        </label>
        <label>
          City <span className="muted">(optional)</span>
          <input
            value={draft.city}
            aria-label="City (optional)"
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            maxLength={80}
            autoComplete="address-level2"
          />
        </label>
        <label>
          Country <span className="muted">(optional)</span>
          <select
            value={draft.countryCode}
            aria-label="Country (optional)"
            disabled={busy}
            onChange={(e) =>
              setDraft({ ...draft, countryCode: e.target.value })
            }
            autoComplete="country"
          >
            <option value="">Prefer not to say</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {countryFlag(c.code)} {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id="handle-help" className="muted">
        3–24 letters, numbers, underscores or hyphens. Your username, avatar and
        any location you add are public.
      </p>
      <fieldset disabled={busy}>
        <legend>Choose your robot</legend>
        <div className="avatar-gallery">
          {avatars.map((id, index) => (
            <label
              className={`avatar-option${draft.avatarId === id ? " selected" : ""}`}
              key={id}
            >
              <input
                type="radio"
                name="avatar"
                value={id}
                checked={draft.avatarId === id}
                onChange={() => setDraft({ ...draft, avatarId: id })}
                aria-label={`Robot ${index + 1}`}
              />
              <img src={avatarURL(id)} alt="" width={72} height={72} />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      <small className="muted">
        Robots by{" "}
        <a
          href="https://www.dicebear.com/styles/bottts/"
          target="_blank"
          rel="noreferrer"
        >
          Pablo Stanley / DiceBear
        </a>
        .
      </small>
    </form>
  );
}
