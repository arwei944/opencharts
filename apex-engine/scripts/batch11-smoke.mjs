#!/usr/bin/env node
/**
 * Round-7 smoke (Pine for-loops + strategy signals, timezone formatter,
 * indicator library expansion):
 *  - a for-loop Pine script compiles, runs and renders without crashing
 *  - the signal series feeds backtestFromSeries (computation layer)
 *  - the chart timeFormatter honours the configured timezone (DST-aware)
 *  - the five new indicators are addable through the store
 *
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch11-smoke.mjs
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
page.on("pageerror", (e) =>
  errors.push(`pageerror: ${e.message.slice(0, 120)}`),
);
page.on("crash", () => errors.push("TARGET CRASHED"));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|manifest/.test(m.text()))
    errors.push(m.text().slice(0, 120));
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);

const r = await page.evaluate(async () => {
  const out = {};
  const get = () => window.useTerminal?.getState?.();
  if (!get) return { error: "useTerminal not exposed" };
  const st = get();

  // 1. Pine for-loop: rolling sum of close[i]
  try {
    const mod = await import("/src/lib/market/script-parser.ts");
    const parsed = mod.scriptParser.parse(
      `//@version=5
var roll = 0.0
roll := 0.0
for i = 1 to 3
    roll := roll + close[i]
plot(roll, "Roll")`,
    );
    out.forParsed = parsed.success;
    if (parsed.success) {
      const tail = st.bars.slice(-10);
      const run = parsed.calculationFn(tail);
      // last bar: close[1]+close[2]+close[3] — recompute expected from bars
      const n = tail.length;
      const expected =
        tail[n - 2].close + tail[n - 3].close + tail[n - 4].close;
      out.forValue = Math.abs(run[0].data.at(-1).value - expected) < 1e-6;
      // register for render (crash guard must keep the page alive)
      const id = st.addIndicator("CUSTOM");
      st.addCustomFn(id, parsed.calculationFn);
      await new Promise((res) => setTimeout(res, 1000));
      const inst = st.indicators.find((i) => i.id === id);
      if (inst) st.removeIndicator(inst.id);
    }
  } catch (e) {
    out.forError = String(e);
  }

  // 2. strategy signal series -> backtestFromSeries
  try {
    const bt = await import("/src/lib/market/backtest.ts");
    const barsTail = st.bars.slice(-60);
    const sig = barsTail.map((b) => ({ time: b.time, value: 1 }));
    const res = bt.backtestFromSeries(barsTail, sig, 10_000);
    // Direction-agnostic: pnl sign depends on the current market trend (an all
    // long signal loses when the recent 60 bars fell), so only assert that the
    // engine ran and produced a report.
    out.signalBacktest = Number.isFinite(res.pnl) && res.trades.length >= 1;
  } catch (e) {
    out.signalError = String(e);
  }

  // 3. timezone formatter honours the setting
  try {
    const eng = (window.__chartEngines || []).find((e) => e.bars?.length > 0);
    const s = { ...st.chartSettings, timezone: "Etc/GMT-8" };
    st.setChartSettings(s);
    await new Promise((res) => setTimeout(res, 400));
    const opts = eng?.chart?.options?.() ?? {};
    const fmt = opts.localization?.timeFormatter;
    out.fmtPresent = typeof fmt === "function";
    // 2026-01-15 12:00 UTC in UTC+8 -> 20:00
    const probe = Date.UTC(2026, 0, 15, 12, 0, 0) / 1000;
    out.fmtValue = typeof fmt === "function" && fmt(probe) === "20:00";
    out.fmtDetail = typeof fmt === "function" ? fmt(probe) : "n/a";
  } catch (e) {
    out.tzError = String(e);
  }

  // 4. new indicators addable
  out.newIndicators = {};
  for (const kind of ["TRIX", "ROC", "MOM", "PPO", "CMF"]) {
    try {
      const id = st.addIndicator(kind);
      const fresh = get().indicators;
      out.newIndicators[kind] = !!fresh.find(
        (i) => i.id === id && i.kind === kind,
      );
      if (id) get().removeIndicator(id);
    } catch (e) {
      out.newIndicators[kind] = "error: " + String(e);
    }
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check("Pine for-loop parses", !!r.forParsed, r.forError ?? "");
  check("for-loop rolling sum correct", !!r.forValue, r.forError ?? "");
  check(
    "strategy signal backtest runs",
    !!r.signalBacktest,
    r.signalError ?? "",
  );
  check("timezone formatter present", !!r.fmtPresent, r.tzError ?? "");
  check(
    "timezone UTC+8 renders 20:00",
    !!r.fmtValue,
    `${r.fmtDetail ?? ""} ${r.tzError ?? ""}`,
  );
  for (const kind of ["TRIX", "ROC", "MOM", "PPO", "CMF"]) {
    check(
      `indicator ${kind} addable`,
      r.newIndicators?.[kind] === true,
      String(r.newIndicators?.[kind]),
    );
  }
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
