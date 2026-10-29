"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export default function CompleteSignup() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  async function finish(skip = false) {
    setBusy(true);
    setError("");
    try {
      await api("/api/guest/import", { skip });
      const room = new URLSearchParams(location.search).get("room");
      location.replace(
        room ? `/play?room=${encodeURIComponent(room)}` : "/play",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    void finish();
  }, []);
  return (
    <section className="narrow">
      <h1>Finishing account creation</h1>
      {busy ? (
        <p role="status">Saving your profile…</p>
      ) : (
        <>
          <p role="alert">{error}</p>
          <p>
            Your guest progress is safe. Retry the import selected during
            signup, or skip it permanently and keep the guest separate.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => finish()}>
              Retry import
            </button>
            <button onClick={() => finish(true)}>
              Skip import permanently
            </button>
          </div>
        </>
      )}
    </section>
  );
}
