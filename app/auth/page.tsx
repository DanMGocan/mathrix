"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { GuestRestore } from "../guest-account";
import { SessionStatus, useSession } from "@/lib/session";
function playDestination() {
  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "tutorial") return "/play?mode=tutorial";
  const room = params.get("room");
  return room ? `/play?room=${encodeURIComponent(room)}` : "/play";
}
function completeDestination() {
  return playDestination().replace("/play", "/auth/complete");
}
const callbackErrors: Record<string, string> = {
  email_not_verified:
    "Verify the email address on your Google or Discord account, then try again.",
  email_not_found:
    "Add and verify an email address on your Google or Discord account, then try again.",
  account_not_linked:
    "Sign in with the provider you used to create this account. Email contact@mathrix.app if you cannot access it.",
  access_denied: "Sign-in was canceled. Choose a provider to try again.",
};
export default function AuthPage() {
  const router = useRouter();
  const { me, loading } = useSession();
  const [guestCode, setGuestCode] = useState(""),
    [destination, setDestination] = useState("/play"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [providers, setProviders] = useState<{
      google: boolean;
      discord: boolean;
    } | null>(null);
  useEffect(() => {
    if (me?.registered && !new URLSearchParams(location.search).get("error")) {
      router.replace(
        me.importPending ? completeDestination() : playDestination(),
      );
      router.refresh();
    }
  }, [me?.registered, me?.importPending, router]);
  useEffect(() => {
    setDestination(playDestination());
    const callbackError = new URLSearchParams(location.search).get("error");
    if (callbackError)
      setError(
        Object.hasOwn(callbackErrors, callbackError)
          ? callbackErrors[callbackError]
          : "Could not sign you in. Try again or use another provider.",
      );
    api<NonNullable<typeof providers>>("/api/providers")
      .then(setProviders)
      .catch(() =>
        setError(
          "Could not load sign-in options. Reload this page and try again.",
        ),
      );
  }, []);
  async function importIntent() {
    if (!guestCode.trim()) return {};
    const { token } = await api<{ token: string }>("/api/guest/import-intent", {
      code: guestCode,
    });
    return { guestImportIntent: token };
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
        errorCallbackURL:
          location.origin + playDestination().replace("/play", "/auth"),
        additionalData: intent,
      });
      location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (loading || (me?.registered && !error))
    return (
      <section className="narrow">
        <SessionStatus />
      </section>
    );
  return (
    <section className="narrow" aria-busy={busy}>
      <h1>Sign in to Mathrix</h1>
      <p>
        Your first sign-in creates an account. Use a verified Google or Discord
        email address. You can change your username in Profile.
      </p>
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
            disabled={busy}
            aria-describedby="guest-import-help"
          />
        </label>
        <p id="guest-import-help">
          Import once when creating a new account. Your rank, stats and history
          transfer, and the guest and its code are removed. Leave blank to start
          fresh. Signing in to an existing account keeps the guest separate.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {(["google", "discord"] as const).map((p) => (
          <button
            key={p}
            disabled={!providers?.[p] || busy}
            onClick={() => social(p)}
            title={
              providers?.[p] === false
                ? "Sign-in currently unavailable"
                : undefined
            }
          >
            Continue with {p === "google" ? "Google" : "Discord"}
          </button>
        ))}
      </div>
      {busy && <p role="status">Opening sign-in…</p>}
      {!providers && !error && <p role="status">Loading sign-in options…</p>}
      {(["google", "discord"] as const).map(
        (p) =>
          providers?.[p] === false && (
            <p className="muted" key={p}>
              {p === "google" ? "Google" : "Discord"} sign-in is currently
              unavailable.
            </p>
          ),
      )}
      <GuestRestore destination={destination} />
    </section>
  );
}
