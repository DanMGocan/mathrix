"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import {
  defaultAds,
  defaultBalance,
  gameStages,
  type Balance,
  type AdConfig,
} from "@/lib/config";
import { registry, type OperationId } from "@/lib/engine";
import DesignFiles from "./design-files";
import Analytics from "./analytics";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  disabled: boolean;
  rating: number;
  played: number;
  wins: number;
  losses: number;
};
type Match = {
  id: string;
  ended_at: string;
  rated: boolean;
  reason: string;
  duration_ms: number;
};
type Campaign = {
  id?: string;
  name: string;
  headline: string;
  body: string;
  image_url: string;
  destination_url: string;
  cta: string;
  audience: "guests" | "registered" | "everyone";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  duration_ms: number;
  weight: number;
  impressions?: number;
  clicks?: number;
  created_at?: string;
};
type Overview = {
  users: number;
  guests: number;
  completed: number;
  today: number;
  average_ms: number;
  draw_rate: number;
  active: {
    id: string;
    status: string;
    players: string[];
    startedAt: number;
  }[];
  queue: string[];
  health: Record<string, string>;
};
const blank: Campaign = {
  name: "",
  headline: "",
  body: "",
  image_url: "",
  destination_url: "https://",
  cta: "Learn more",
  audience: "everyone",
  active: true,
  starts_at: null,
  ends_at: null,
  duration_ms: 4000,
  weight: 1,
};
const labels = (s: string) =>
  s
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
export default function Admin() {
  const [tab, setTab] = useState("Overview"),
    [overview, setOverview] = useState<Overview | null>(null),
    [users, setUsers] = useState<User[]>([]),
    [matches, setMatches] = useState<Match[]>([]),
    [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [balance, setBalance] = useState<Balance>(defaultBalance),
    [settingsLoaded, setSettingsLoaded] = useState(false),
    [loadError, setLoadError] = useState(""),
    [ads, setAds] = useState<AdConfig>(defaultAds),
    [campaign, setCampaign] = useState<Campaign>(blank),
    [preview, setPreview] = useState<Campaign | null>(null),
    [search, setSearch] = useState(""),
    [date, setDate] = useState(""),
    [result, setResult] = useState(""),
    [detail, setDetail] = useState<unknown>(null),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoadError("");
    setMessage("");
    try {
      const [o, s, u, m, c] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<{ balance: Balance; ads: AdConfig }>("/api/admin/settings"),
        api<User[]>(`/api/admin/users?q=${encodeURIComponent(search)}`),
        api<Match[]>(
          `/api/admin/matches?player=${encodeURIComponent(search)}&date=${date}&result=${result}`,
        ),
        api<Campaign[]>("/api/admin/campaigns"),
      ]);
      setOverview(o);
      setBalance(s.balance);
      setAds(s.ads);
      setSettingsLoaded(true);
      setCampaign((current) =>
        current.id || current.name
          ? current
          : { ...current, duration_ms: s.ads.houseDurationMs },
      );
      setUsers(u);
      setMatches(m);
      setCampaigns(c);
    } catch (e) {
      setLoadError((e as Error).message);
      setMessage((e as Error).message);
    }
  }, [search, date, result]);
  useEffect(() => {
    void load();
  }, [load]);
  async function saveSettings() {
    if (!settingsLoaded) return;
    try {
      await api("/api/admin/settings", { balance, ads });
      setMessage(
        "Settings saved. Existing matches retain their original rules.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function changeUser(u: User, data: unknown) {
    try {
      await api(`/api/admin/users/${u.id}`, data);
      await load();
      setMessage("User updated.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function saveCampaign(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { impressions: _, clicks: __, created_at: ___, ...data } = campaign;
      void _;
      void __;
      void ___;
      await api("/api/admin/campaigns", data);
      setCampaign({ ...blank, duration_ms: ads.houseDurationMs });
      await load();
      setMessage("Campaign saved.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const stageTotals = Object.fromEntries(
    gameStages.map((stage) => [
      stage,
      Object.values(balance.weights[stage]).reduce(
        (sum, weight) => sum + weight,
        0,
      ),
    ]),
  );
  const countTiles = overview
    ? [
        ["Registered users", overview.users],
        ["Saved guest profiles", overview.guests],
        ["Matches today", overview.today],
        ["Active games", overview.active.length],
        ["Queued players", overview.queue.length],
        ["Completed games", overview.completed],
        ["Average duration", `${(overview.average_ms / 1000).toFixed(1)}s`],
        ["Draw rate", `${(overview.draw_rate * 100).toFixed(1)}%`],
      ]
    : [];
  return (
    <section className="admin page">
      <div className="admin-heading">
        <div>
          <h1>Administration</h1>
        </div>
        <div className="actions">
          <Link className="button" href="/admin/audit">
            Audit
          </Link>
          <Link className="button" href="/admin/docs">
            Documentation ↗
          </Link>
        </div>
      </div>
      <div className="admin-tabs">
        {[
          "Overview",
          "Analytics",
          "Users",
          "Matches",
          "Live",
          "Leaderboard",
          "Game balance",
          "Tiles",
          "Advertising",
          "Design files",
        ].map((t) => (
          <button
            key={t}
            className={t === tab ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setDetail(null);
              setMessage("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab !== "Design files" && tab !== "Analytics" && (
        <div className="admin-tools">
          <button onClick={() => void load()}>Refresh data</button>
          <span role="status">{message}</span>
        </div>
      )}
      {tab === "Design files" && <DesignFiles />}
      {tab === "Analytics" && <Analytics />}
      {tab === "Overview" && (
        <>
          <div className="stat-grid">
            {countTiles.map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <h2>Service health</h2>
          <div className="service-health">
            {Object.entries(overview?.health || {}).map(([k, v]) => (
              <span key={k}>
                {k}: <b>{v}</b>
              </span>
            ))}
          </div>
          <p>
            Rule changes apply to newly reserved matches. House ad metrics show
            actual impressions and clicks; no revenue is estimated.
          </p>
          <Link href="/admin/docs">Read the game documentation →</Link>
        </>
      )}
      {tab === "Users" && (
        <>
          <div className="actions">
            <input
              aria-label="Search users"
              placeholder="Search email or display name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={() => void load()}>Search</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Rating</th>
                  <th>Games</th>
                  <th>Status / actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <small>{u.email}</small>
                      <button
                        onClick={async () =>
                          setDetail(await api(`/api/admin/users/${u.id}`))
                        }
                      >
                        Inspect
                      </button>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        onChange={(e) =>
                          void changeUser(u, { role: e.target.value })
                        }
                      >
                        <option>USER</option>
                        <option>ADMIN</option>
                      </select>
                    </td>
                    <td>
                      {u.rating ?? 1000}
                      <button
                        onClick={() => {
                          if (confirm(`Reset ${u.name}'s rating?`))
                            void changeUser(u, { resetRating: true });
                        }}
                      >
                        Reset rating
                      </button>
                    </td>
                    <td>{u.played ?? 0}</td>
                    <td>
                      <button
                        onClick={() =>
                          void changeUser(u, { disabled: !u.disabled })
                        }
                      >
                        {u.disabled ? "Restore" : "Suspend"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail !== null && (
            <div className="panel">
              <h2>User detail · stats · providers · history</h2>
              <pre>{JSON.stringify(detail, null, 2)}</pre>
            </div>
          )}
        </>
      )}
      {tab === "Matches" && (
        <>
          <div className="filter-grid">
            <label>
              Player
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Display name or user ID"
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Result
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
              >
                <option value="">All</option>
                {["WIN", "LOSS", "DRAW"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button onClick={() => void load()}>Filter</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Match ID</th>
                  <th>Match</th>
                  <th>When</th>
                  <th>Duration</th>
                  <th>Type</th>
                  <th>End reason</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.id}
                      <button
                        type="button"
                        aria-label={`Copy match ID ${m.id}`}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.id);
                            setMessage("Match ID copied.");
                          } catch {
                            setMessage(
                              "Could not copy. Select the match ID and copy it manually.",
                            );
                          }
                        }}
                      >
                        Copy
                      </button>
                    </td>
                    <td>
                      <Link href={`/matches/${m.id}`}>
                        Inspect {m.id.slice(0, 8)} ↗
                      </Link>
                    </td>
                    <td>{new Date(m.ended_at).toLocaleString()}</td>
                    <td>{(m.duration_ms / 1000).toFixed(1)}s</td>
                    <td>{m.rated ? "Rated" : "Unrated"}</td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Match details include initial/final matrices, timeouts, disconnects,
            every accepted action, and rating changes.
          </p>
        </>
      )}
      {tab === "Live" && (
        <>
          <h2>Active games ({overview?.active.length || 0})</h2>
          {overview?.active.map((g) => (
            <article className="panel" key={g.id}>
              <b>{g.players.join(" vs ")}</b>
              <p>
                {g.id} · {g.status} ·{" "}
                {g.startedAt
                  ? new Date(g.startedAt).toLocaleTimeString()
                  : "Waiting for readiness"}
              </p>
            </article>
          ))}
          <h2>Queue ({overview?.queue.length || 0})</h2>
          <p>{overview?.queue.join(", ") || "No players waiting."}</p>
        </>
      )}
      {tab === "Leaderboard" && (
        <>
          <Link className="button" href="/leaderboard">
            Inspect current leaderboard ↗
          </Link>
          <h2>Rating maintenance</h2>
          <p>
            Reset ratings only when no games are active. Historical rating
            changes remain available for auditing.
          </p>
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Reset ALL current ratings to the configured starting rating?",
                )
              )
                return;
              try {
                await api("/api/admin/ratings/reset", {});
                setMessage("Ratings reset.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Reset all ratings
          </button>
        </>
      )}
      {tab === "Game balance" && (
        <>
          <p>
            Milliseconds for timing. Tile weights are in the Tiles tab. All
            changes are validated by the server.
          </p>
          <div className="filter-grid">
            {Object.entries(balance)
              .filter(([k, v]) => k !== "weights" && typeof v === "number")
              .map(([k, v]) => (
                <label key={k}>
                  {labels(k)}
                  <input
                    type="number"
                    step={k.includes("Decay") ? "0.01" : "1"}
                    min={
                      k === "maxCellValue"
                        ? 100
                        : k === "maxRows" || k === "maxColumns"
                          ? 2
                          : undefined
                    }
                    max={
                      k === "maxCellValue"
                        ? defaultBalance.maxCellValue
                        : k === "maxRows" || k === "maxColumns"
                          ? 5
                          : undefined
                    }
                    value={v as number}
                    onChange={(e) =>
                      setBalance({ ...balance, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
          </div>
          <p>
            Ranked games affect ratings for guests and registered players.
            Casual games and custom rooms are always unranked.
          </p>
          <button
            className="primary"
            disabled={!settingsLoaded}
            onClick={() => void saveSettings()}
          >
            Save game balance
          </button>
        </>
      )}
      {tab === "Tiles" && loadError && (
        <p role="alert">{loadError} Use Refresh data to try again.</p>
      )}
      {tab === "Tiles" && !settingsLoaded && !loadError && (
        <p role="status">Loading tile settings…</p>
      )}
      {tab === "Tiles" && settingsLoaded && (
        <>
          <h2>All tiles ({Object.keys(registry).length})</h2>
          <p>
            Each stage shows its weight and base draw chance: the tile’s weight
            divided by the total weight for that stage. Actual chances depend on
            which tiles have legal targets; time tiles are excluded in Practice.
            Percentages update as you edit and are not historical appearance
            counts.
          </p>
          <p>
            Lower weights make tiles rarer; zero disables a tile. At least one
            unrestricted arithmetic tile must remain enabled in each stage. Each
            stage initially lasts one third of the match. Numeric variants share
            one row; N ranges from {balance.numericMin} to {balance.numericMax}.
            Maximum Square/Cube bonuses always range from +1 to +5. Saved
            changes apply to new matches; existing matches retain their rules.
          </p>
          <div className="table-wrap">
            <table className="tile-list">
              <thead>
                <tr>
                  <th>Tile</th>
                  <th>What it does</th>
                  <th>Type</th>
                  <th>Target</th>
                  {gameStages.map((stage) => (
                    <th key={stage}>
                      {labels(stage)}
                      <small>Weight / Base draw chance</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(registry).map(([id, def]) => (
                  <tr key={id} data-operation={id}>
                    <th scope="row">
                      {def.label}
                      <small>{id}</small>
                    </th>
                    <td>{def.description}</td>
                    <td>
                      {labels(def.kind)}
                      {def.tier && <small>{labels(def.tier)}</small>}
                      {def.seconds !== undefined && (
                        <small>{def.seconds}s</small>
                      )}
                    </td>
                    <td>
                      {def.target === "MATCH_CLOCK"
                        ? "Shared match clock"
                        : def.target === "PLAYER"
                          ? "Your maximum"
                          : def.target === "CARD_POOL"
                            ? "Shared tile pool"
                            : def.target === "TURN_CLOCK"
                              ? def.ownership === "SELF_ONLY"
                                ? "Your current turn"
                                : "Opponent’s next turn"
                              : def.ownership === "SELF_ONLY"
                                ? "Your matrix"
                                : def.ownership === "OPPONENT_ONLY"
                                  ? "Opponent matrix"
                                  : "Either matrix"}
                      <small>{labels(def.target.toLowerCase())}</small>
                    </td>
                    {gameStages.map((stage) => {
                      const weight = balance.weights[stage][id as OperationId];
                      const chance = (weight / stageTotals[stage]) * 100;
                      return (
                        <td key={stage}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            aria-label={`${def.label} ${stage} rarity weight`}
                            aria-describedby={`${id}-${stage}-chance`}
                            value={weight}
                            onChange={(e) =>
                              setBalance({
                                ...balance,
                                weights: {
                                  ...balance.weights,
                                  [stage]: {
                                    ...balance.weights[stage],
                                    [id]: Number(e.target.value),
                                  },
                                },
                              })
                            }
                          />
                          <small id={`${id}-${stage}-chance`}>
                            {!Number.isFinite(chance) ||
                            weight < 0 ||
                            stageTotals[stage] <= 0
                              ? "—"
                              : weight === 0
                                ? "Disabled · 0%"
                                : chance < 0.01
                                  ? "<0.01%"
                                  : `${chance.toFixed(2)}%`}
                          </small>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="primary" onClick={() => void saveSettings()}>
            Save tile weights
          </button>
        </>
      )}
      {tab === "Advertising" && (
        <>
          <h2>Pre-game advertising</h2>
          <div className="filter-grid">
            {Object.entries(ads)
              .filter(([, v]) => typeof v === "boolean")
              .map(([k, v]) => (
                <label className="toggle" key={k}>
                  <input
                    type="checkbox"
                    checked={v as boolean}
                    onChange={(e) => setAds({ ...ads, [k]: e.target.checked })}
                  />
                  {labels(k)}
                </label>
              ))}
            <label>
              Advertising mode
              <select
                value={ads.mode}
                onChange={(e) =>
                  setAds({ ...ads, mode: e.target.value as AdConfig["mode"] })
                }
              >
                {["OFF", "HOUSE_ADS", "EXTERNAL_PROVIDER", "HYBRID"].map(
                  (m) => (
                    <option key={m}>{m}</option>
                  ),
                )}
              </select>
            </label>
            {Object.entries(ads)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => (
                <label key={k}>
                  {labels(k)}
                  <input
                    type="number"
                    value={v as number}
                    onChange={(e) =>
                      setAds({ ...ads, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
          </div>
          <button className="primary" onClick={() => void saveSettings()}>
            Save advertising controls
          </button>
          <p>
            Provider settings live in the server environment. Google H5 supports
            test ads and live ads after H5 approval and consent-message setup.
            Reload game pages after changing provider or test mode. No revenue
            data is fabricated.
          </p>
          <h2>House campaigns</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Audience</th>
                  <th>Impressions</th>
                  <th>Clicks / CTR</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <small>{c.active ? "Active" : "Disabled"}</small>
                    </td>
                    <td>{c.audience}</td>
                    <td>{c.impressions}</td>
                    <td>
                      {c.clicks} /{" "}
                      {c.impressions
                        ? (((c.clicks || 0) / c.impressions) * 100).toFixed(1)
                        : "0"}
                      %
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setCampaign({
                            ...c,
                            starts_at: c.starts_at
                              ? new Date(c.starts_at).toISOString()
                              : null,
                            ends_at: c.ends_at
                              ? new Date(c.ends_at).toISOString()
                              : null,
                          })
                        }
                      >
                        Edit
                      </button>
                      <button onClick={() => setPreview(c)}>Preview</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>{campaign.id ? "Edit campaign" : "Create campaign"}</h2>
          <form onSubmit={saveCampaign}>
            <div className="filter-grid">
              {(
                [
                  "name",
                  "headline",
                  "body",
                  "image_url",
                  "destination_url",
                  "cta",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {labels(k)}
                  <input
                    value={campaign[k]}
                    required={k !== "image_url"}
                    onChange={(e) =>
                      setCampaign({ ...campaign, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Audience
                <select
                  value={campaign.audience}
                  onChange={(e) =>
                    setCampaign({
                      ...campaign,
                      audience: e.target.value as Campaign["audience"],
                    })
                  }
                >
                  {["everyone", "guests", "registered"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label>
                Duration (ms)
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  value={campaign.duration_ms}
                  onChange={(e) =>
                    setCampaign({
                      ...campaign,
                      duration_ms: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Campaign weight
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={campaign.weight}
                  onChange={(e) =>
                    setCampaign({ ...campaign, weight: Number(e.target.value) })
                  }
                />
              </label>
              {(["starts_at", "ends_at"] as const).map((k) => (
                <label key={k}>
                  {labels(k)}
                  <input
                    type="datetime-local"
                    value={
                      campaign[k]
                        ? new Date(
                            new Date(campaign[k]!).getTime() -
                              new Date(campaign[k]!).getTimezoneOffset() *
                                60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        [k]: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
              ))}
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={campaign.active}
                  onChange={(e) =>
                    setCampaign({ ...campaign, active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
            <button className="primary">Save campaign</button>
            <button
              type="button"
              onClick={() =>
                setCampaign({ ...blank, duration_ms: ads.houseDurationMs })
              }
            >
              New campaign
            </button>
          </form>
          {preview && (
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="House ad preview"
            >
              <article className="house-ad">
                <button onClick={() => setPreview(null)}>Close preview</button>
                <small>ADVERTISEMENT · PREVIEW (NOT COUNTED)</small>
                {preview.image_url && <img src={preview.image_url} alt="" />}
                <h2>{preview.headline}</h2>
                <p>{preview.body}</p>
                <a
                  className="button"
                  href={preview.destination_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                >
                  {preview.cta}
                </a>
                <p>
                  {preview.duration_ms / 1000}s · {preview.audience}
                </p>
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}
