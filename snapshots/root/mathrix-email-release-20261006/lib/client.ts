"use client";
import type { PlayerAppearance } from "./profile";
export type Me = PlayerAppearance & {
  id: string;
  name: string;
  registered: boolean;
  role: string;
  importPending?: boolean;
};
export async function api<T = unknown>(
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "include",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await res.json();
  if (!res.ok) throw Error(value.error || value.message || "Request failed");
  return value;
}
let soundMuted = false;
export function muteGameSound(muted: boolean) {
  soundMuted = muted;
}
export function sound(kind: string) {
  if (
    soundMuted ||
    typeof window === "undefined" ||
    localStorage.getItem("mathrix_sound") !== "on"
  )
    return;
  const ctx = new AudioContext();
  const o = ctx.createOscillator(),
    gain = ctx.createGain();
  o.type = "sine";
  o.frequency.value =
    kind === "block" ? 220 : kind === "hit" ? 880 : kind === "win" ? 1046 : 440;
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  o.connect(gain);
  gain.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.13);
  o.onended = () => void ctx.close();
}
