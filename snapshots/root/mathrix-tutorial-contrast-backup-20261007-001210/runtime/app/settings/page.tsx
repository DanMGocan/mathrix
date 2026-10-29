"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { onPrivacyReady, showPrivacySettings } from "@/lib/h5-ads";
import { useSession } from "@/lib/session";
export default function Settings() {
  const { me, loading, refresh } = useSession();
  const [audio, setAudio] = useState(false),
    [mobileKeyboardHints, setMobileKeyboardHints] = useState(false),
    [privacyReady, setPrivacyReady] = useState(false),
    [tutorialEnabled, setTutorialEnabled] = useState(true),
    [tutorialSaving, setTutorialSaving] = useState(false),
    [tutorialError, setTutorialError] = useState("");
  useEffect(() => {
    setTutorialEnabled(me?.tutorialEnabled ?? true);
    setTutorialError("");
  }, [me?.id, me?.tutorialEnabled]);
  async function saveTutorialPreference(enabled: boolean) {
    if (!me || me.importPending || tutorialSaving) return;
    setTutorialSaving(true);
    setTutorialError("");
    try {
      const saved = await api<{ enabled: boolean }>(
        "/api/tutorial-preference",
        { enabled },
      );
      setTutorialEnabled(saved.enabled);
      await refresh().catch(() => {});
    } catch {
      setTutorialError(
        "Could not save your tutorial preference. Your previous choice is unchanged. Try the checkbox again.",
      );
    } finally {
      setTutorialSaving(false);
    }
  }
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
      <label className="toggle">
        <input
          type="checkbox"
          checked={tutorialEnabled}
          disabled={loading || !me || me.importPending || tutorialSaving}
          onChange={(e) => void saveTutorialPreference(e.target.checked)}
          aria-describedby="tutorial-preference-description"
        />
        Show tutorial game on Play
      </label>
      <p id="tutorial-preference-description">
        {me?.importPending
          ? "Finish your account setup to save this preference."
          : !loading && !me
            ? "Sign in or play as a guest to save this preference."
            : "A guided game against an easy AI, with no time limit or stats. This choice is saved to your player profile across devices."}
      </p>
      {tutorialSaving && <p role="status">Saving tutorial preference…</p>}
      {tutorialError && <p role="alert">{tutorialError}</p>}
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
