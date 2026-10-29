import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { setImmediate } from "node:timers/promises";
import { Collector, Metrics, ProbeRunner } from "../server/metrics";
import { measurement, mergeAggregate, type Aggregates } from "../lib/analytics";
import { db } from "../server/db";

test("metrics merge distributions, preserve empty samples and roll minutes without inventing gaps", () => {
  const flushed: { at: number; data: Aggregates }[] = [];
  const c = new Collector((at, data) => flushed.push({ at, data }), 1000);
  for (let i = 0; i < 99; i++) c.record("latency", 1, true, 2000);
  c.record("latency", 2000, true, 61000);
  assert.equal(flushed[0].at, 0);
  const combined = mergeAggregate(flushed[0].data.latency, c.data.latency);
  assert.deepEqual(measurement(combined), {
    count: 100,
    mean: 20.99,
    max: 2000,
    p95: 1,
  });
  assert.equal(measurement().mean, null);
  c.record("invalid", NaN, false, 62000);
  c.record("invalid", -1, false, 62000);
  assert.equal(c.data.invalid, undefined);
  c.rotate(240000);
  assert.deepEqual(
    flushed.map((x) => x.at),
    [0, 60000],
  );
  assert.deepEqual(c.data, {});
  c.record("long", 900000, true, 240001);
  assert.equal(measurement(c.data.long).p95, 900000);
});

test("dependency probes time out without queuing requests or recording late successes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let calls = 0,
    resolve!: () => void;
  const observed: number[] = [];
  const probe = new ProbeRunner(
    () => {
      calls++;
      return new Promise<void>((r) => {
        resolve = r;
      });
    },
    (ms) => observed.push(ms),
  );
  probe.run();
  probe.run();
  await setImmediate();
  assert.equal(calls, 1);
  t.mock.timers.tick(2000);
  assert.equal(probe.state.status, "timeout");
  probe.run();
  assert.equal(calls, 1);
  resolve();
  await setImmediate();
  assert.equal(observed.length, 0);
  probe.run();
  await setImmediate();
  resolve();
  await setImmediate();
  assert.equal(calls, 2);
  assert.equal(probe.state.status, "ok");
  assert.equal(observed.length, 1);
});

test("HTTP responses count once, aborts differ from errors, and analytics polling is excluded", () => {
  const m = new Metrics();
  const request = (url: string) => ({ url }) as IncomingMessage;
  const response = () =>
    Object.assign(new EventEmitter(), {
      writableFinished: true,
      statusCode: 400,
    }) as unknown as ServerResponse;
  const res = response();
  m.trackHTTP(request("/api/me"), res);
  res.emit("finish");
  res.emit("close");
  assert.equal(m.collector.data.http_4xx.count, 1);
  assert.equal(m.collector.data.http_ms.count, 1);
  for (const url of ["/api/health", "/api/admin/analytics?range=30d"]) {
    const ignored = response();
    m.trackHTTP(request(url), ignored);
    ignored.emit("finish");
  }
  assert.equal(m.collector.data.http_ms.count, 1);
  const aborted = Object.assign(new EventEmitter(), {
    writableFinished: false,
    statusCode: 200,
  }) as unknown as ServerResponse;
  m.trackHTTP(request("/api/profile"), aborted);
  aborted.emit("close");
  assert.equal(m.collector.data.http_aborted.count, 1);
});

test("telemetry writes are bounded, failed intervals are dropped, and later intervals recover", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 3600000 });
  let release!: () => void;
  const writes: unknown[][] = [];
  let fail = false;
  t.mock.method(db, "query", async (sql: string, values: unknown[]) => {
    if (sql.startsWith("INSERT")) {
      writes.push(values);
      if (fail) throw Error("database down");
      await new Promise<void>((r) => {
        release = r;
      });
    }
    return { rows: [] };
  });
  t.mock.method(console, "error", () => {});
  const m = new Metrics();
  m.record("requests");
  t.mock.timers.tick(60000);
  m.collector.rotate();
  m.record("requests");
  t.mock.timers.tick(60000);
  m.collector.rotate();
  assert.equal(writes.length, 1);
  assert.equal(m.droppedIntervals, 1);
  release();
  await setImmediate();
  fail = true;
  m.record("requests");
  t.mock.timers.tick(60000);
  m.collector.rotate();
  await setImmediate();
  assert.equal(m.droppedIntervals, 2);
  fail = false;
  m.record("requests");
  t.mock.timers.tick(60000);
  m.collector.rotate();
  release();
  await setImmediate();
  assert.equal(writes.length, 3);
  assert.equal(m.lastPersistedAt, Date.now());
  assert.notEqual(new Metrics().instance, m.instance);
});
