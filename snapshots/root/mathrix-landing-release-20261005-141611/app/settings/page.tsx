"use client";
import { useEffect, useState } from "react";
import { onPrivacyReady, showPrivacySettings } from "@/lib/h5-ads";
export default function Settings() {
  const [audio, setAudio] = useState(false),
    [privacyReady, setPrivacyReady] = useState(false);
  useEffect(() => {
    setAudio(localStorage.getItem("mathrix_sound") === "on");
    let disposed = false;
    onPrivacyReady(() => {
      if (!disposed) setPrivacyReady(true);
    });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <section className="narrow">
      <div className="eyebrow">MAKE IT YOURS</div>
      <h1>Preferences</h1>
      <label className="toggle">
        <input
          type="checkbox"
          checked={audio}
          onChange={(e) => {
            setAudio(e.target.checked);
            localStorage.setItem(
              "mathrix_sound",
              e.target.checked ? "on" : "off",
            );
          }}
        />
        Original game sound effects
      </label>
      <button onClick={showPrivacySettings} disabled={!privacyReady}>
        Privacy and cookie settings
      </button>
      <p>
        Google’s consent message lets you choose how your data is used for ads
        and change your choices later. You can play without accepting
        personalized ads.
      </p>
      {!privacyReady && (
        <p className="muted">Privacy controls are currently unavailable.</p>
      )}
    </section>
  );
}
