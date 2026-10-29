"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
export default function AuthPage() {
  const router = useRouter();
  const [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [providers, setProviders] = useState({ google: false, discord: false });
  useEffect(() => {
    api<typeof providers>("/api/providers")
      .then(setProviders)
      .catch(() => {});
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        email: data.get("email"),
        password: data.get("password"),
        ...(signup ? { name: data.get("name") } : {}),
      });
      router.push("/play");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function social(provider: string) {
    try {
      const d = await api<{ url: string }>("/api/auth/sign-in/social", {
        provider,
        callbackURL: location.origin + "/play",
      });
      location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="narrow">
      <div className="eyebrow">YOUR NEXT MOVE</div>
      <h1>{signup ? "Join the matrix" : "Welcome back"}</h1>
      <form onSubmit={submit}>
        {signup && (
          <label>
            Display name
            <input
              name="name"
              required
              minLength={2}
              maxLength={40}
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
            disabled={!providers[p]}
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
    </section>
  );
}
