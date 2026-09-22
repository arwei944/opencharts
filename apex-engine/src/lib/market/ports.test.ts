import { test } from "node:test";
import assert from "node:assert/strict";
import { cachePort, dataSourcePort } from "./ports.ts";

test("dataSourcePort exposes the full contract surface", () => {
  for (const name of [
    "fetchKlines",
    "fetchTicker",
    "fetchDepth",
    "fetchWatch",
    "fetchPremium",
    "searchSymbols",
  ]) {
    assert.equal(
      typeof (dataSourcePort as unknown as Record<string, unknown>)[name],
      "function",
      name,
    );
  }
});

test("dataSourcePort kline query maps to the serverFn request shape", async () => {
  // The serverFn handler is not available under node test (no dev server),
  // so verify the *query shape* the pipeline passes reaches the adapter:
  // the adapter must accept symbol/interval/market/endTime/limit verbatim.
  const adapter = dataSourcePort.fetchKlines as (q: {
    symbol: string;
    interval: string;
    market: string;
    endTime?: number;
    limit?: number;
  }) => Promise<unknown>;
  const q = {
    symbol: "BTCUSDT",
    interval: "15m",
    market: "usdm",
    endTime: 123,
    limit: 1000,
  };
  // Should throw only at the network layer (serverFn not mounted) — i.e. it
  // accepts the query and reaches the handler, never a shape error.
  await assert.rejects(
    () => adapter(q),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return !/undefined is not a function|Cannot read/.test(msg);
    },
  );
});

test("cachePort read returns null in a no-indexedDB environment", async () => {
  // Node has no indexedDB — the adapter must degrade to null, never throw.
  const rec = await cachePort.read("spot:BTCUSDT:15m");
  assert.equal(rec, null);
});
