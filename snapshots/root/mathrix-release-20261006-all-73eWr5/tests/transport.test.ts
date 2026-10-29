import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { EventEmitter, once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Socket } from "socket.io";

test("backend and proxy bound authentication bodies and normalize client IPs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mathrix-transport-"));
  const keys = [
    "APP_URL",
    "GAME_PORT",
    "GAME_HOST",
    "STATE_DIR",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PREMIUM_PRICE_ID",
    "BREVO_SMTP_KEY",
    "BREVO_SMTP_LOGIN",
    "BREVO_FROM_EMAIL",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    APP_URL: "http://example.test",
    GAME_PORT: "0",
    GAME_HOST: "127.0.0.1",
    STATE_DIR: directory,
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PREMIUM_PRICE_ID: "",
    BREVO_SMTP_KEY: "",
    BREVO_SMTP_LOGIN: "",
    BREVO_FROM_EMAIL: "",
  });
  const signals = ["SIGINT", "SIGTERM"] as const;
  const listeners = signals.map((signal) => process.listeners(signal));
  const intervals: ReturnType<typeof setInterval>[] = [];
  const originalInterval = globalThis.setInterval;
  t.mock.method(
    globalThis,
    "setInterval",
    (...args: Parameters<typeof setInterval>) => {
      const timer = originalInterval(...args);
      intervals.push(timer);
      return timer;
    },
  );
  let backend: http.Server | undefined;
  t.after(async () => {
    intervals.forEach(clearInterval);
    signals.forEach((signal, i) => {
      for (const listener of process.listeners(signal))
        if (!listeners[i].includes(listener)) process.off(signal, listener);
    });
    backend?.closeAllConnections();
    if (backend?.listening)
      await new Promise<void>((resolve) => backend!.close(() => resolve()));
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    await rm(directory, { recursive: true, force: true });
  });
  t.mock.module("node:http", {
    namedExports: {
      Agent: http.Agent,
      createServer: (handler: http.RequestListener) =>
        (backend = http.createServer(handler)),
    },
  });
  const rateKeys: string[] = [];
  t.mock.module("../server/db.ts", {
    namedExports: {
      db: { query: async () => ({ rows: [] }) },
      redis: { del: async () => {}, set: async () => {}, ping: async () => {} },
      connectRedis: async () => {},
      rateLimit: async (key: string) => {
        rateKeys.push(key);
        return true;
      },
    },
  });
  let authCalls = 0;
  const identityIPs: (string | null)[] = [];
  t.mock.module("../server/auth.ts", {
    namedExports: {
      auth: {
        api: {
          getSession: async ({ headers }: { headers: Headers }) => {
            identityIPs.push(headers.get("x-forwarded-for"));
            return { response: null, headers: new Headers() };
          },
        },
        handler: async (request: Request) => {
          authCalls++;
          if (new URL(request.url).pathname.endsWith("/redirect")) {
            const response = new Response(null, {
              status: 302,
              headers: { Location: "/play" },
            });
            response.headers.append("Set-Cookie", "first=1; Path=/; HttpOnly");
            response.headers.append("Set-Cookie", "second=2; Path=/; HttpOnly");
            return response;
          }
          return new Response(
            request.method === "HEAD"
              ? null
              : JSON.stringify({
                  body: await request.text(),
                  ip: request.headers.get("x-forwarded-for"),
                }),
            { headers: { "Content-Type": "application/json" } },
          );
        },
      },
    },
  });
  let socketMiddleware: (
    socket: Socket,
    next: (error?: Error) => void,
  ) => Promise<void>;
  t.mock.module("socket.io", {
    namedExports: {
      Server: function () {
        return Object.assign(new EventEmitter(), {
          use(middleware: typeof socketMiddleware) {
            socketMiddleware = middleware;
          },
          close() {},
        });
      },
    },
  });
  t.mock.module("../server/metrics.ts", {
    namedExports: {
      metrics: { trackHTTP() {}, record() {}, start: () => async () => {} },
    },
  });
  await import("../server/index");
  assert.ok(backend);
  if (!backend.listening) await once(backend, "listening");
  const backendPort = (backend.address() as AddressInfo).port;

  async function request(
    port: number,
    path: string,
    body?: string,
    headers: http.OutgoingHttpHeaders = {},
    chunked = false,
    localAddress?: string,
  ) {
    return new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const outgoing = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          localAddress,
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: "http://example.test",
            ...(body === undefined || chunked
              ? {}
              : { "Content-Length": Buffer.byteLength(body) }),
            ...headers,
          },
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("error", reject);
          incoming.on("end", () =>
            resolve({
              status: incoming.statusCode!,
              headers: incoming.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.setTimeout(3000, () =>
        outgoing.destroy(Error("Request timed out")),
      );
      if (body !== undefined) {
        const bytes = Buffer.from(body),
          split = Math.min(16384, bytes.length - 1);
        outgoing.write(bytes.subarray(0, split));
        if (chunked) {
          void delay(5).then(() => outgoing.end(bytes.subarray(split)));
          return;
        }
        outgoing.write(bytes.subarray(split));
      }
      outgoing.end();
    });
  }
  const jsonHeaders = { "Content-Type": "application/json" };
  const exact = JSON.stringify({ value: "x".repeat(32756) });
  assert.equal(Buffer.byteLength(exact), 32768);
  const beforeHeaders = authCalls;
  assert.equal(
    (
      await request(backendPort, "/api/auth/test", "", {
        ...jsonHeaders,
        "Content-Length": 32769,
      })
    ).status,
    413,
    "declared oversize must be rejected without waiting for the body",
  );
  assert.equal(authCalls, beforeHeaders);
  for (const chunked of [false, true]) {
    const accepted = await request(
      backendPort,
      "/api/auth/test",
      exact,
      jsonHeaders,
      chunked,
    );
    assert.equal(accepted.status, 200);
    assert.equal(JSON.parse(accepted.body).body, exact);
    const before = authCalls;
    const rejected = await request(
      backendPort,
      "/api/auth/test",
      exact + " ",
      jsonHeaders,
      chunked,
    );
    assert.equal(rejected.status, 413);
    assert.equal(rejected.headers.connection, "close");
    assert.equal(
      authCalls,
      before,
      "oversized bodies must be rejected before authentication",
    );
  }
  for (const [type, body] of [
    [
      "application/json",
      JSON.stringify({
        text: "x".repeat(16374) + "é你好",
        callbackURL: "http://example.test/play",
      }),
    ],
    ["application/x-www-form-urlencoded", "code=abc&state=a%2Bb"],
  ]) {
    const response = await request(
      backendPort,
      "/api/auth/test",
      body,
      { "Content-Type": type },
      true,
    );
    assert.equal(JSON.parse(response.body).body, body);
  }
  const redirect = await request(backendPort, "/api/auth/redirect");
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, "/play");
  assert.equal(redirect.headers["set-cookie"]?.length, 2);
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${backendPort}/api/auth/test`, {
        method: "HEAD",
        headers: { Origin: "http://example.test" },
      })
    ).status,
    200,
  );
  const webhook = await request(
    backendPort,
    "/api/billing/webhook",
    " ".repeat(32769),
    jsonHeaders,
  );
  assert.equal(
    webhook.status,
    503,
    "webhook must retain its separate 256 KiB envelope",
  );
  for (const peer of ["127.0.0.1", "198.51.100.9"]) {
    const fake = {
      request: {
        headers: { "x-forwarded-for": "203.0.113.7" },
        socket: { remoteAddress: peer },
      },
      data: {},
    };
    await socketMiddleware!(fake as unknown as Socket, () => {});
    const expected = peer === "127.0.0.1" ? "203.0.113.7" : peer;
    assert.equal(identityIPs.at(-1), expected);
    assert.equal(rateKeys.at(-1), `connect:${expected}`);
  }

  const reservation = http.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const proxyPort = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const source = await readFile(
    new URL("../deploy/Caddyfile", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("http://152.53.14.163"));
  const global = source
    .slice(0, source.indexOf("www.mathrix.app"))
    .replace("{", "{\n\tadmin off\n\tauto_https off\n\tpersist_config off")
    .replace(/(trusted_proxies static [^\n]+)/, "$1 127.0.0.1/32");
  const site = source
    .slice(source.indexOf("\nmathrix.app {") + 1)
    .replace(
      "mathrix.app {",
      `http://127.0.0.1:${proxyPort} {\n\tbind 127.0.0.1`,
    )
    .replace(/127\.0\.0\.1:300[01]/g, `127.0.0.1:${backendPort}`)
    .replace(/\n\tlog \{[\s\S]*?\n\t\}/, "");
  const configuration = join(directory, "Caddyfile");
  await writeFile(configuration, global + site);
  const proxy = spawn(
    "caddy",
    ["run", "--config", configuration, "--adapter", "caddyfile"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  proxy.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-4000);
  });
  t.after(async () => {
    if (proxy.exitCode === null && proxy.signalCode === null) {
      const stopped = once(proxy, "exit");
      proxy.kill("SIGTERM");
      await stopped;
    }
  });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    assert.equal(proxy.exitCode, null, diagnostics);
    try {
      ready = (await request(proxyPort, "/api/health")).status === 200;
    } catch {}
    if (!ready) await delay(20);
  }
  assert.ok(ready, diagnostics);
  for (const ip of ["203.0.113.7", "2001:db8::8"]) {
    const response = await request(proxyPort, "/api/auth/test", undefined, {
      "CF-Connecting-IP": ip,
      "X-Forwarded-For": "192.0.2.99, 192.0.2.98",
    });
    assert.equal(JSON.parse(response.body).ip, ip);
    assert.ok(rateKeys.includes(`http:${ip}`));
  }
  const untrusted = await request(
    proxyPort,
    "/api/auth/test",
    undefined,
    { "CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "192.0.2.99" },
    false,
    "127.0.0.2",
  );
  assert.equal(JSON.parse(untrusted.body).ip, "127.0.0.2");
  assert.equal(
    (await request(proxyPort, "/api/auth/test", exact, jsonHeaders)).status,
    200,
  );
  assert.equal(
    (await request(proxyPort, "/api/auth/test", exact + " ", jsonHeaders, true))
      .status,
    413,
  );
});
