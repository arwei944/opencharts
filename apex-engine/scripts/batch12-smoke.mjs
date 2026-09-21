#!/usr/bin/env node
/**
 * Round-8 smoke (indicator 24→32 + search filter + Pine backtest UI):
 *  - the eight new indicators are addable through the store
 *  - the indicator modal search input filters the catalog (DOM-level)
 *  - the backtester's Pine-script tab runs a signal script and renders a report
 *
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch12-smoke.mjs
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

  // 1. new indicators addable
  out.newIndicators = {};
  for (const kind of [
    "WMA",
    "TRIMA",
    "VWMA",
    "NATR",
    "BBW",
    "DPO",
    "TSI",
    "AO",
  ]) {
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

  // 2. indicator search filter (DOM)
  try {
    st.setIndicatorOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    const input = document.querySelector('input[type="search"]');
    out.searchInput = !!input;
    if (input) {
      // searCh "rsi" should leave RSI visible and hide unrelated catalog items
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      set.call(input, "rsi");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((res) => setTimeout(res, 250));
      const buttons = [...document.querySelectorAll("button")];
      const rsiBtn = buttons.some((b) =>
        b.getAttribute("aria-label")?.includes("RSI"),
      );
      const kdjBtn = buttons.some((b) =>
        b.getAttribute("aria-label")?.includes("KDJ"),
      );
      out.searchFilters = rsiBtn && !kdjBtn;
    } else {
      out.searchFilters = false;
    }
    st.setIndicatorOpen(false);
  } catch (e) {
    out.searchError = String(e);
  }

  // 3. Pine-script backtest tab renders a report
  try {
    st.setBacktestOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    const pineTab = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().includes("Pine 脚本"),
    );
    pineTab?.click();
    await new Promise((res) => setTimeout(res, 500));
    const ta = document.querySelector("textarea");
    out.pineTab = !!pineTab && !!ta;
    out.pineReport =
      !!document.body.innerText.includes("总盈亏") &&
      !!document.body.innerText.includes("夏普");
    out.pineNoError = !document.body.innerText.includes("⚠");
    st.setBacktestOpen(false);
  } catch (e) {
    out.backtestError = String(e);
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  for (const kind of [
    "WMA",
    "TRIMA",
    "VWMA",
    "NATR",
    "BBW",
    "DPO",
    "TSI",
    "AO",
  ]) {
    check(
      `indicator ${kind} addable`,
      r.newIndicators?.[kind] === true,
      String(r.newIndicators?.[kind]),
    );
  }
  check("indicator search input present", !!r.searchInput, r.searchError ?? "");
  check(
    "search filters catalog (RSI yes, KDJ no)",
    !!r.searchFilters,
    r.searchError ?? "",
  );
  check("backtest Pine tab present", !!r.pineTab, r.backtestError ?? "");
  check("Pine backtest renders report", !!r.pineReport, r.backtestError ?? "");
  check(
    "Pine backtest no script error",
    !!r.pineNoError,
    r.backtestError ?? "",
  );
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
