import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { latencyBounds, measurements, type Aggregates, type Probe, type AnalyticsResponse } from "../lib/analytics";
import { db, redis } from "./db";

export class Collector {
  data: Aggregates = {};
  bucket: number;
  constructor(private flush: (at: number, data: Aggregates) => void, now = Date.now()) {
    this.bucket = Math.floor(now / 60000) * 60000;
  }
  rotate(now = Date.now(), force = false) {
    const next = Math.floor(now / 60000) * 60000;
    if (!force && next === this.bucket) return;
    const data = this.data, at = this.bucket;
    this.data = {};
    this.bucket = next;
    if (Object.keys(data).length) this.flush(at, data);
  }
  record(key: string, value = 1, histogram = false, now = Date.now()) {
    if (!Number.isFinite(value) || value < 0) return;
    this.rotate(now);
    const a = this.data[key] ??= { count: 0, sum: 0, max: 0, ...(histogram ? { buckets: Array(latencyBounds.length + 1).fill(0) } : {}) };
    a.count++;
    a.sum += value;
    a.max = Math.max(a.max, value);
    if (a.buckets) {
      const i = latencyBounds.findIndex((bound) => value <= bound);
      a.buckets[i < 0 ? latencyBounds.length : i]++;
    }
  }
}

// Retain the underlying promise after timeout: a stalled dependency cannot grow a request queue.
export class ProbeRunner {
  state: Probe = { status: "pending", at: null, ms: null };
  private running = false;
  constructor(private operation: () => Promise<unknown>, private record: (ms: number) => void) {}
  run() {
    if (this.running) return;
    this.running = true;
    const start = performance.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.state = { status: "timeout", at: Date.now(), ms: null };
    }, 2000);
    timer.unref();
    void Promise.resolve().then(this.operation).then(() => {
      if (!timedOut) {
        const ms = performance.now() - start;
        this.state = { status: "ok", at: Date.now(), ms };
        this.record(ms);
      }
    }, () => {
      if (!timedOut) this.state = { status: "error", at: Date.now(), ms: null };
    }).finally(() => { clearTimeout(timer); this.running = false; });
  }
}

export class Metrics {
  readonly startedAt = Date.now();
  readonly instance = randomUUID();
  sampledAt: number | null = null;
  values: Record<string, number> = {};
  lastPersistedAt: number | null = null;
  droppedIntervals = 0;
  private writing: Promise<void> | null = null;
  private lastPruned = 0;
  readonly collector = new Collector((at, data) => this.persist(at, data));
  readonly database = new ProbeRunner(() => db.query("SELECT 1"), (ms) => this.record("database_ms", ms, true));
  readonly cache = new ProbeRunner(() => redis.ping(), (ms) => this.record("redis_ms", ms, true));
  record(key: string, value = 1, histogram = false) { this.collector.record(key, value, histogram); }
  private persist(at: number, data: Aggregates) {
    if (this.writing) { this.droppedIntervals++; return; }
    this.writing = (async () => {
      try {
        await db.query("INSERT INTO performance_minutes(bucket_start,instance_id,metrics) VALUES($1,$2,$3) ON CONFLICT(bucket_start,instance_id) DO UPDATE SET metrics=EXCLUDED.metrics", [new Date(at), this.instance, JSON.stringify(data)]);
        this.lastPersistedAt = Date.now();
        if (Date.now() - this.lastPruned >= 3600000) {
          this.lastPruned = Date.now();
          await db.query("DELETE FROM performance_minutes WHERE bucket_start < now() - interval '30 days'");
        }
      } catch {
        this.droppedIntervals++;
        console.error(JSON.stringify({ event: "metrics_write_failed" }));
      } finally { this.writing = null; }
    })();
  }
  trackHTTP(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url || "").split("?")[0];
    if (path === "/api/health" || path === "/api/admin/analytics") return;
    const start = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.record("http_ms", performance.now() - start, true);
      this.record(res.writableFinished ? `http_${Math.floor(res.statusCode / 100)}xx` : "http_aborted");
    };
    res.once("finish", finish);
    res.once("close", finish);
  }
  live(): AnalyticsResponse["live"] {
    return { startedAt: this.startedAt, sampledAt: this.sampledAt, values: { ...this.values }, currentMinute: measurements(this.collector.data), probes: { database: { ...this.database.state }, redis: { ...this.cache.state } }, lastPersistedAt: this.lastPersistedAt, droppedIntervals: this.droppedIntervals };
  }
  start(activity: () => Record<string, number>) {
    const delay = monitorEventLoopDelay({ resolution: 20 });
    delay.enable();
    let cpu = process.cpuUsage(), previous = performance.now();
    const sample = () => {
      const now = Date.now(), mono = performance.now(), elapsed = mono - previous;
      const nextCPU = process.cpuUsage(), memory = process.memoryUsage();
      this.collector.rotate(now);
      this.values = {
        cpu_percent: ((nextCPU.user - cpu.user + nextCPU.system - cpu.system) / (elapsed * 1000)) * 100,
        rss_mb: memory.rss / 1048576, heap_mb: memory.heapUsed / 1048576,
        pool_total: db.totalCount, pool_idle: db.idleCount, pool_waiting: db.waitingCount,
        ...activity(),
      };
      if (delay.count) {
        this.values.loop_mean_ms = delay.mean / 1e6;
        this.values.loop_max_ms = delay.max / 1e6;
      }
      for (const [key, value] of Object.entries(this.values)) this.collector.record(key, value, false, now);
      this.collector.record("observed_ms", elapsed, false, now);
      this.sampledAt = now;
      cpu = nextCPU; previous = mono; delay.reset();
      this.database.run(); this.cache.run();
    };
    const timer = setInterval(sample, 10000);
    timer.unref();
    return async () => {
      clearInterval(timer); delay.disable();
      this.collector.rotate(Date.now(), true);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([this.writing, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 2000); })]);
      clearTimeout(timeout);
    };
  }
}
export const metrics = new Metrics();
