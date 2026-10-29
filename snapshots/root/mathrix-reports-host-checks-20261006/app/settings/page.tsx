"use client";
import { useEffect, useState } from "react";
import { onPrivacyReady, showPrivacySettings } from "@/lib/h5-ads";
export default function Settings() {
  const [audio, setAudio] = useState(false),
    [mobileKeyboardHints, setMobileKeyboardHints] = useState(false),
    [privacyReady, setPrivacyReady] = useState(false);
  useEffect(() => {
    setAudio(localStorage.getItem("mathrix_sound") === "on");
    setMobileKeyboardHints(
      localStorage.getItem("mathrix_mobile_keyboard_hints") === "on",
    );
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
      <label className="toggle">
        <input
          type="checkbox"
          checked={mobileKeyboardHints}
          onChange={(e) => {
            setMobileKeyboardHints(e.target.checked);
            localStorage.setItem(
              "mathrix_mobile_keyboard_hints",
              e.target.checked ? "on" : "off",
            );
          }}
        />
        Show keyboard hints on mobile
      </label>
      <p>
        Show card keys, target keys and shortcut guidance during mobile play.
        Keyboard shortcuts work with hints hidden; desktop hints stay visible.
      </p>
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
