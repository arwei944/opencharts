import { test } from "node:test";
import assert from "node:assert/strict";
import { Telemetry } from "./telemetry.ts";
import { PerfStats } from "./perf-metrics.ts";

test("telemetry: logs under capacity in order", () => {
  const t = new Telemetry(10);
  t.log("commit", { bars: 3 }, 1.5);
  t.log("tail", { barTime: 9 }, 0.2);
  const s = t.snapshot();
  assert.equal(s.length, 2);
  assert.equal(s[0].op, "commit");
  assert.equal((s[0].detail as { bars?: number })?.bars, 3);
  assert.equal(s[0].ms, 1.5);
  assert.equal(s[1].op, "tail");
});

test("telemetry: ring overwrites oldest past capacity", () => {
  const t = new Telemetry(5);
  for (let i = 0; i < 12; i++) t.log("commit", { i });
  const s = t.snapshot();
  assert.equal(s.length, 5);
  // Newest five entries, oldest→newest.
  assert.deepEqual(
    s.map((e) => (e.detail as { i?: number })?.i),
    [7, 8, 9, 10, 11],
  );
});

test("telemetry: clear empties the ring", () => {
  const t = new Telemetry(5);
  t.log("commit");
  t.clear();
  assert.equal(t.snapshot().length, 0);
});

test("perf: empty snapshot is zeroed", () => {
  const p = new PerfStats(10);
  assert.deepEqual(p.snapshot(), {
    count: 0,
    min: 0,
    max: 0,
    avg: 0,
    p50: 0,
    p95: 0,
  });
});

test("perf: percentiles over a known sample set", () => {
  const p = new PerfStats(100);
  // 1..20 → p50 should be 10 (floor(0.5*20)=10 → 11th value = 11? use even n)
  for (let i = 1; i <= 20; i++) p.record(i);
  const s = p.snapshot();
  assert.equal(s.count, 20);
  assert.equal(s.min, 1);
  assert.equal(s.max, 20);
  assert.equal(s.avg, 10.5);
  // pct(0.5) = sorted[floor(0.5*20)] = sorted[10] = 11 (0-indexed)
  assert.equal(s.p50, 11);
  // pct(0.95) = sorted[floor(0.95*20)] = sorted[19] = 20
  assert.equal(s.p95, 20);
});

test("perf: window caps memory", () => {
  const p = new PerfStats(4);
  for (let i = 0; i < 100; i++) p.record(i);
  assert.equal(p.snapshot().count, 4);
  assert.equal(p.snapshot().min, 96);
});
