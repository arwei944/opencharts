#!/usr/bin/env node
/**
 * Batch 13 headless smoke — P3-D5 regression probes for the architecture-layer
 * work (V4: 透明/智能/自动/积木化). Verifies the runtime behavior of the
 * P0-P3 building blocks from the live app:
 *
 *  - aggregate: local multi-TF derivation (P0-C1) is aligned + live-tail aware
 *  - predictor: velocity-aware lookahead math (P1-C2)
 *  - lineage: per-series source provenance is populated (P1-B2)
 *  - telemetry: op-log + perf percentiles are actually recording (P0-B1)
 *  - healer: findGaps/healMasterGaps are callable and no-op on healthy data (P2-C4)
 *  - plugins: registry v2 merged catalogs include builtins + demo plugins (P2-A3)
 *  - invariants: DEV self-test runs clean on live commits (P3-D4)
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch13-smoke.mjs
 */
import { chromium } from "playwright";

const URL = process.env.BASE_URL || "http://127.0.0.1:8080";
const PASS = [];
const FAIL = [];

function check(name, cond, detail = "") {
  (cond ? PASS : FAIL).push(`${name}${detail ? " — " + detail : ""}`);
  console.log(
    `${cond ? "✅" : "❌"} ${name}${detail ? " (" + detail + ")" : ""}`,
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);

const r = await page.evaluate(async () => {
  const out = {};
  const get = () => window.useTerminal?.getState?.();
  if (!get) return { error: "useTerminal not exposed" };
  const st = get();

  // 1. aggregate: 15m bars → 1h derivation is UTC-aligned, last is open
  try {
    const agg = await import("/src/lib/market/aggregate.ts");
    const step = 3600;
    const derived = agg.aggregateCandles(st.bars.slice(-400), step);
    const aligned = derived.every((b) => b.time % step === 0);
    out.aggAligned = derived.length > 0 && aligned;
    out.aggLiveTail =
      derived.length > 0 && derived[derived.length - 1].closed === false;
    out.aggCount = derived.length;
  } catch (e) {
    out.aggError = String(e);
  }

  // 2. predictor: leftward pan → amplified lookahead
  try {
    const pred = await import("/src/lib/market/predictor.ts");
    const samples = [
      { t: 0, from: 10000, to: 11000 },
      { t: 1000, from: 4000, to: 5000 },
    ];
    const v = pred.predictVelocity(samples);
    out.predictVelocity = v;
    out.predictAmp = pred.adaptiveLookahead(v) > 2000;
  } catch (e) {
    out.predictError = String(e);
  }

  // 3. lineage: master key has provenance counters
  try {
    const key = `${st.market}:${st.symbol}:${st.interval}`;
    const li = st.dataLineage?.[key];
    out.lineagePopulated =
      !!li && li.sources.ws + li.sources.rest + li.sources.cache > 0;
    out.lineageKey = key;
    out.lineage = li ? li.sources : null;
  } catch (e) {
    out.lineageError = String(e);
  }

  // 4. telemetry: op-log + perf percentiles recording
  try {
    const tel = window.__chartTelemetry;
    const ops = tel ? tel.snapshot().map((o) => o.op) : [];
    out.telOps = [...new Set(ops)].slice(0, 12);
    out.telHasCommit = ops.includes("commit");
    out.telHasDecide = ops.includes("commitDecide");
    const perf = window.__chartPerf;
    out.perfCount = perf?.commitPerf?.snapshot?.().count ?? 0;
  } catch (e) {
    out.telError = String(e);
  }

  // 5. healer: callable, no-op on healthy data
  try {
    const heal = await import("/src/lib/market/healer.ts");
    const gaps = heal.findGaps(st.bars, 900);
    out.healGaps = gaps.length;
    out.healHealthy = gaps.length === 0 || gaps.every((g) => g.missing > 0);
    out.healNoop = (await heal.healMasterGaps(1)) === 0;
  } catch (e) {
    out.healError = String(e);
  }

  // 6. plugins: rendered UI evidence (same module graph the app uses — a
  //    dynamic absolute-URL import forks the registry instance in dev, so
  //    assert on what the user sees instead): toolbar lists X 记号, and the
  //    indicator modal lists 双均线带 after opening it.
  try {
    out.toolbarHasXmark = (document.body.textContent ?? "").includes("X 记号");
    const st0 = get();
    st0.setIndicatorOpen(true);
    await new Promise((res) => setTimeout(res, 600));
    out.modalHasDSMA = (document.body.textContent ?? "").includes("双均线带");
    st0.setIndicatorOpen(false);
    await new Promise((res) => setTimeout(res, 200));
  } catch (e) {
    out.pluginError = String(e);
  }

  // 7. invariants: DEV self-test runs clean on the live series
  try {
    const inv = await import("/src/lib/market/invariants.ts");
    const res = inv.runInvariants(st.bars, st.bars.slice(-4000));
    out.invOk = res.ok;
    out.invDetail = `${res.monotonic}/${res.columns}/${res.tailSync}`;
  } catch (e) {
    out.invError = String(e);
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check(
    "aggregate: 1h derivation UTC-aligned",
    !!r.aggAligned,
    `count=${r.aggCount}`,
  );
  check("aggregate: live tail marked open", !!r.aggLiveTail);
  check(
    "predictor: leftward pan amplifies lookahead",
    !!r.predictAmp,
    `v=${r.predictVelocity}`,
  );
  check(
    "lineage: provenance populated",
    !!r.lineagePopulated,
    JSON.stringify(r.lineage),
  );
  check(
    "telemetry: op-log records commits",
    !!r.telHasCommit && !!r.telHasDecide,
    r.telOps?.join(","),
  );
  check(
    "telemetry: perf percentiles have samples",
    (r.perfCount ?? 0) > 0,
    `commit samples=${r.perfCount}`,
  );
  check(
    "healer: findGaps callable on healthy data",
    !!r.healHealthy,
    `gaps=${r.healGaps}`,
  );
  check("healer: healMasterGaps no-op when healthy", !!r.healNoop);
  check("plugins: toolbar renders plugin tool", !!r.toolbarHasXmark);
  check("plugins: indicator modal lists plugin indicator", !!r.modalHasDSMA);
  check("invariants: DEV self-test clean", !!r.invOk, r.invDetail);
}

const pageErr = errors.filter((e) => !e.includes("favicon"));
check("no page errors", pageErr.length === 0, pageErr.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n==== ${PASS.length} passed, ${FAIL.length} failed ====`);
process.exit(FAIL.length ? 1 : 0);
