import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bumpLineage,
  emptyLineage,
  lineageSummary,
  type LineageInfo,
} from "./lineage.ts";

test("lineage: empty summary is zeroed", () => {
  assert.deepEqual(lineageSummary(undefined), {
    rest: 0,
    ws: 0,
    okx: 0,
    cache: 0,
    total: 0,
  });
});

test("lineage: bump accumulates per source without touching others", () => {
  let l: LineageInfo | undefined;
  l = bumpLineage(l, "ws", 3, 1000);
  l = bumpLineage(l, "rest", 1000, 2000);
  l = bumpLineage(l, "ws", 1, 3000);
  assert.equal(l.sources.ws, 4);
  assert.equal(l.sources.rest, 1000);
  assert.equal(l.sources.cache, 0);
  assert.equal(l.sources.okx, 0);
  assert.equal(l.lastSeen.ws, 3000);
  assert.equal(l.lastSeen.rest, 2000);
  assert.equal(l.updatedAt, 3000);
});

test("lineage: first bump fabricates a full record", () => {
  const l = bumpLineage(undefined, "cache", 13000, 42);
  assert.deepEqual(l.sources, { rest: 0, ws: 0, okx: 0, cache: 13000 });
  assert.equal(l.lastSeen.cache, 42);
});

test("lineageSummary totals across sources", () => {
  const l = bumpLineage(
    bumpLineage(bumpLineage(undefined, "ws", 5), "rest", 100),
    "okx",
    9,
  );
  assert.deepEqual(lineageSummary(l), {
    rest: 100,
    ws: 5,
    okx: 9,
    cache: 0,
    total: 114,
  });
});

test("emptyLineage returns a fresh (unshared) record", () => {
  const a = emptyLineage();
  const b = emptyLineage();
  a.sources.ws = 99;
  assert.equal(b.sources.ws, 0);
});
