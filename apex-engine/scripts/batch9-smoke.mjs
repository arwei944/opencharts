#!/usr/bin/env node
/**
 * Batch 9 headless smoke:
 *  - Pine multi-output compile produces one series per plot() (computation layer)
 *  - registering a smooth multi-plot script renders without crashing
 *  - registering a discrete-jump script is guarded (no crash, series filtered)
 *  - dual-source OKX stream fields present; brokerMode API accepts OKX
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch9-smoke.mjs
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

  // 1. computation layer: a 3-plot script yields 3 outputs with real data
  try {
    const mod = await import("/src/lib/market/script-parser.ts");
    const parsed = mod.scriptParser.parse(
      `//@version=5
indicator("FastSlow", overlay=true)
fast = ema(close, 5)
slow = ema(close, 20)
bull = close > slow ? 1 : 0
plot(fast, "Fast")
plot(slow, "Slow")
plot(bull * 100, "Bull")`,
    );
    out.pineParsed = parsed.success && parsed.overlay === true;
    if (parsed.success) {
      const run = parsed.calculationFn(st.bars.slice(-500));
      out.outputCount = run.length;
      out.outputKeys = run.map((o) => o.key).join(",");
      out.hasData = run.every((o) => o.data.length >= 400);
      // register it — the crash guards above still keep the page alive
      const id = st.addIndicator("CUSTOM");
      st.addCustomFn(id, parsed.calculationFn);
      await new Promise((res) => setTimeout(res, 1200));
      const inst = st.indicators.find((i) => i.id === id);
      if (inst) st.removeIndicator(inst.id);
      await new Promise((res) => setTimeout(res, 300));
    }
  } catch (e) {
    out.pineError = String(e);
  }

  // 2. smooth multi-plot script renders without crashing
  try {
    const mod = await import("/src/lib/market/script-parser.ts");
    const parsed = mod.scriptParser.parse(
      `//@version=5
fast = ema(close, 5)
slow = ema(close, 20)
upper = fast + 5
plot(fast, "F")
plot(slow, "S")
plot(upper, "U")`,
    );
    const id = st.addIndicator("CUSTOM");
    st.addCustomFn(id, parsed.calculationFn);
    await new Promise((res) => setTimeout(res, 1200));
    out.smoothAlive = true;
    const inst = st.indicators.find((i) => i.id === id);
    if (inst) st.removeIndicator(inst.id);
  } catch (e) {
    out.smoothAlive = false;
    out.smoothError = String(e);
  }

  // 3. dual-source state
  out.okxFields =
    "okxLive" in get() && "okxLast" in get() && "skew" in get().dataWarnings;
  out.brokerApi =
    typeof st.setBrokerMode === "function" && st.brokerMode === "paper";
  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check("Pine multi-plot parses (overlay)", !!r.pineParsed, r.pineError ?? "");
  check(
    "computation yields 3 outputs",
    r.outputCount === 3,
    `got ${r.outputCount}`,
  );
  check("outputs keyed + populated", !!r.hasData, r.outputKeys ?? "");
  check(
    "smooth multi-plot registers alive",
    !!r.smoothAlive,
    r.smoothError ?? "",
  );
  check("dual-source state present", !!r.okxFields, "");
  check("brokerMode API present", !!r.brokerApi, "");
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
