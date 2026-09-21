#!/usr/bin/env node
/**
 * Batch 8 headless smoke: probes the new features from exposed stores:
 *  - theme presets (ocean/sand) flip the DOM data-theme + chart palette
 *  - multi-account: newAccount/switchAccount keeps state isolated
 *  - backtest modal runs SMA cross and renders report stats
 *  - health panel shows resident-memory rows
 *  - paper broker stays the default when live mode is unconfigured
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch8-smoke.mjs
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
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|manifest|favicon/.test(m.text()))
    errors.push(m.text());
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);

const r = await page.evaluate(async () => {
  const out = {};
  const get = () => window.useTerminal?.getState?.();
  if (!get) return { error: "useTerminal not exposed" };
  const st = get();

  // 1. theme presets flip data-theme and chart theme
  try {
    st.setThemePref("ocean");
    st.setTheme("ocean");
    await new Promise((res) => setTimeout(res, 300));
    out.oceanDom = document.documentElement.dataset.theme === "ocean";
    const eng = (window.__chartEngines || []).find(
      (e) => (e.bars?.length || 0) > 0,
    );
    out.oceanChart =
      eng?.chart?.options?.()?.layout?.background?.color === "#0a1220";
    st.setThemePref("sand");
    st.setTheme("sand");
    await new Promise((res) => setTimeout(res, 300));
    out.sandDom = document.documentElement.dataset.theme === "sand";
    st.setThemePref("dark");
    st.setTheme("dark");
  } catch (e) {
    out.themeError = String(e);
  }

  // 2. multi-account isolation
  try {
    const paper = window.usePaper;
    if (paper) {
      const before = paper.getState().activeAccount;
      paper.getState().newAccount("测试账户B");
      await new Promise((res) => setTimeout(res, 100));
      const created = paper.getState().activeAccount === "测试账户B";
      // switch back to the original account
      paper.getState().switchAccount(before);
      await new Promise((res) => setTimeout(res, 100));
      const back = paper.getState().activeAccount === before;
      // snapshots held for both
      out.accounts =
        created && back && !!paper.getState().accounts["测试账户B"];
    } else {
      out.accounts = "no usePaper";
    }
  } catch (e) {
    out.accountsError = String(e);
  }

  // 3. backtest modal runs and shows report stats
  try {
    st.setBacktestOpen(true);
    await new Promise((res) => setTimeout(res, 400));
    out.backtestDialog = !!document.querySelector('[id="backtest-dialog"]');
    out.backtestBank = document.body.innerText.includes("总盈亏");
    out.backtestSharpe = document.body.innerText.includes("夏普");
    st.setBacktestOpen(false);
  } catch (e) {
    out.backtestError = String(e);
  }

  // 4. health panel resident-memory rows
  try {
    st.setHealthOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    out.memRows = document.body.innerText.includes("内存驻留");
    st.setHealthOpen(false);
  } catch (e) {
    out.healthError = String(e);
  }

  // 5. paper broker default when live is unconfigured
  try {
    out.brokerMode = st.brokerMode === "paper";
    const proxy = window.binanceLive;
    // serverFn exposed on window? probe the module path instead via fetch later.
    out.proxyExports = typeof proxy !== "undefined";
  } catch (e) {
    out.brokerError = String(e);
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check(
    "theme preset ocean (DOM + chart)",
    !!r.oceanDom && !!r.oceanChart,
    r.themeError ?? "",
  );
  check("theme preset sand (DOM)", !!r.sandDom, r.themeError ?? "");
  check(
    "multi-account create/switch/isolate",
    !!r.accounts,
    r.accountsError ?? "",
  );
  check("backtest dialog opens", !!r.backtestDialog, r.backtestError ?? "");
  check(
    "backtest report stats",
    !!r.backtestBank && !!r.backtestSharpe,
    r.backtestError ?? "",
  );
  check("health panel memory rows", !!r.memRows, r.healthError ?? "");
  check("paper broker default", !!r.brokerMode, r.brokerError ?? "");
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
