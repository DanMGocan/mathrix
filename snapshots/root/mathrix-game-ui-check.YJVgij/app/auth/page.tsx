"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { GuestRestore } from "../guest-account";
import { SessionStatus, useSession } from "@/lib/session";
function playDestination() {
  const room = new URLSearchParams(location.search).get("room");
  return room ? `/play?room=${encodeURIComponent(room)}` : "/play";
}
function completeDestination() {
  return playDestination().replace("/play", "/auth/complete");
}
export default function AuthPage() {
  const router = useRouter();
  const { me, loading, refresh } = useSession();
  const [signup, setSignup] = useState(false),
    [guestCode, setGuestCode] = useState(""),
    [destination, setDestination] = useState("/play"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [providers, setProviders] = useState({ google: false, discord: false });
  useEffect(() => {
    if (me?.registered) {
      router.replace(
        me.importPending ? completeDestination() : playDestination(),
      );
      router.refresh();
    }
  }, [me?.registered, me?.importPending, router]);
  useEffect(() => {
    setSignup(new URLSearchParams(location.search).get("signup") === "1");
    setDestination(playDestination());
    api<typeof providers>("/api/providers")
      .then(setProviders)
      .catch(() => {});
  }, []);
  async function importIntent() {
    if (!signup || !guestCode.trim()) return {};
    const { token } = await api<{ token: string }>("/api/guest/import-intent", {
      code: guestCode,
    });
    return { guestImportIntent: token };
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const intent = await importIntent();
      await api(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        email: data.get("email"),
        password: data.get("password"),
        ...(signup ? { name: data.get("name"), handle: data.get("name") } : {}),
        ...intent,
      });
      const player = await refresh();
      if (!player?.registered) throw Error("This account is unavailable.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function social(provider: string) {
    setBusy(true);
    setError("");
    try {
      const intent = await importIntent();
      const d = await api<{ url: string }>("/api/auth/sign-in/social", {
        provider,
        callbackURL: location.origin + playDestination(),
        newUserCallbackURL: location.origin + completeDestination(),
        additionalData: intent,
      });
      location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (loading || me?.registered)
    return (
      <section className="narrow">
        <SessionStatus />
      </section>
    );
  return (
    <section className="narrow">
      <h1>{signup ? "Join the matrix" : "Welcome back"}</h1>
      {signup && (
        <div className="guest-account">
          <label>
            Import guest user code (optional)
            <input
              value={guestCode}
              onChange={(e) => setGuestCode(e.target.value)}
              maxLength={128}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <p>
            This is your only chance to import a guest into this new account.
            Its rank, stats and history will transfer; the guest and its code
            will disappear. Leave blank to start fresh. This also applies to new
            Google and Discord accounts, but never to an existing account.
          </p>
        </div>
      )}
      <form onSubmit={submit}>
        {signup && (
          <label>
            Username
            <input
              name="name"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_\-]{3,24}"
              autoComplete="nickname"
            />
          </label>
        )}
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            minLength={signup ? 8 : 1}
            maxLength={128}
            autoComplete={signup ? "new-password" : "current-password"}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {(["google", "discord"] as const).map((p) => (
          <button
            key={p}
            disabled={!providers[p] || busy}
            onClick={() => social(p)}
            title={!providers[p] ? "Provider setup pending" : undefined}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
      <button
        className="text-button"
        onClick={() => {
          setSignup(!signup);
          setError("");
        }}
      >
        {signup
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
      <p className="muted">
        Google and Discord become available when their credentials are
        configured.
      </p>
      <GuestRestore destination={destination} />
    </section>
  );
}
