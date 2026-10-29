import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

export function requestIP(req: {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}) {
  const peer = req.socket.remoteAddress || "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer) &&
    typeof forwarded === "string" &&
    isIP(forwarded.trim())
    ? forwarded.trim()
    : peer;
}

export function safeURL(value: string, allowEmpty = false) {
  if (allowEmpty && !value) return "";
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw Error("Only public HTTP(S) URLs are allowed");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "[::1]" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  )
    throw Error("Private URLs are not allowed");
  return u.toString();
}
export function parseCookies(raw: string | undefined) {
  return Object.fromEntries(
    (raw || "")
      .split(";")
      .map((x) => x.trim().split(/=(.*)/s))
      .filter((x) => x[0] && x[1] !== undefined)
      .map(([k, v]) => [k, v]),
  );
}
export function validOrigin(origin: string | undefined, appURL: string) {
  return origin === new URL(appURL).origin;
}
