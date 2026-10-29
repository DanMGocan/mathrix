import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeH5, showPregameAd } from "../lib/h5-ads";

test("a stalled H5 placement releases its UI on cancellation and ignores late callbacks", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"] });
  const storage = new Map<string, string>();
  const globals = ["window", "sessionStorage", "localStorage"] as const;
  const previous = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  t.after(() =>
    globals.forEach((key, i) => {
      if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!);
      else Reflect.deleteProperty(globalThis, key);
    }),
  );
  type Placement = Parameters<NonNullable<Window["adBreak"]>>[0];
  const placements: Placement[] = [];
  Object.assign(globalThis, {
    window: {
      adsbygoogle: {
        push(options: Placement) {
          options.onReady?.();
          if (options.type) {
            placements.push(options);
            options.beforeAd?.();
          }
        },
      },
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    localStorage: { getItem: () => null },
  });
  const config = {
    enabled: true,
    clientId: "ca-pub-6449099608711175",
    testMode: true,
  };
  initializeH5(config);
  let current = true;
  const showing: boolean[] = [];
  const done = showPregameAd(
    "cancelled",
    config,
    () => current,
    (value) => showing.push(value),
  );
  assert.deepEqual(showing, [true]);
  assert.equal(
    showPregameAd(
      "cancelled",
      config,
      () => current,
      () => {},
    ),
    done,
  );
  current = false;
  t.mock.timers.tick(100);
  await done;
  assert.deepEqual(showing, [true, false]);

  const next = showPregameAd(
    "next",
    config,
    () => true,
    (value) => showing.push(value),
  );
  placements[0].afterAd?.();
  placements[0].adBreakDone?.({ breakStatus: "viewed" });
  assert.throws(() => placements[0].beforeAd?.(), /expired/);
  assert.deepEqual(showing, [true, false, true]);
  placements[1].adBreakDone?.({ breakStatus: "viewed" });
  await next;
  assert.deepEqual(showing, [true, false, true, false]);
});
