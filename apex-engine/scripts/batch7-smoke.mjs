#!/usr/bin/env node
/**
 * Batch 7 headless smoke: probes the new features from the exposed store:
 *  - risk limits reject oversized orders with a message
 *  - export dialog opens (CSV/JSON + presets)
 *  - depth modal renders the DepthChart SVG
 *  - BottomPanel "表现" tab renders equity stats + curve
 *  - health panel opens with live feed stats
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch7-smoke.mjs
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
  if (m.type() === "error" && !/favicon|manifest/.test(m.text()))
    errors.push(m.text());
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);

const r = await page.evaluate(async () => {
  const out = {};
  const get = () => window.useTerminal?.getState?.();
  if (!get) return { error: "useTerminal not exposed" };
  const st = get();

  // 1. risk limits reject oversized orders
  try {
    const paperStore = window.usePaper;
    if (paperStore) {
      const st0 = paperStore.getState();
      paperStore.setState({ risk: {} });
      paperStore.getState().setRisk({ maxQty: 2 });
      const err = st0.place({
        symbol: "BTCUSDT",
        market: "spot",
        side: "buy",
        type: "limit",
        price: 100,
        qty: 5,
      });
      out.riskQty = typeof err === "string" && err.includes("最大下单数量");
      paperStore.setState({ risk: {} });
      paperStore.getState().setRisk({ maxNotional: 500 });
      const err2 = paperStore.getState().place({
        symbol: "BTCUSDT",
        market: "spot",
        side: "buy",
        type: "limit",
        price: 200,
        qty: 3,
      });
      out.riskNotional =
        typeof err2 === "string" && err2.includes("单笔下单额度");
      paperStore.setState({ risk: {} });
    } else {
      out.riskQty = out.riskNotional = "no usePaper on window";
    }
  } catch (e) {
    out.riskError = String(e);
  }

  // 2. export dialog
  try {
    st.setExportOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    out.exportDialog = !!document.querySelector('[id="export-dialog"]');
    out.exportPresets = !!document.body.innerText.includes("最近 30 天");
    st.setExportOpen(false);
  } catch (e) {
    out.exportError = String(e);
  }

  // 3. depth modal
  try {
    st.setDepthOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    out.depthDialog = !!document.querySelector('[id="depth-dialog"]');
    out.depthSvg = !!document.querySelector('[aria-label="订单簿累计深度"]');
    st.setDepthOpen(false);
  } catch (e) {
    out.depthError = String(e);
  }

  // 4. performance tab (BottomPanel)
  try {
    const paperStore = window.usePaper;
    if (paperStore) {
      paperStore.setState({
        fills: [
          {
            id: "p1",
            time: Date.now() - 1000,
            orderId: "o1",
            symbol: "BTCUSDT",
            market: "usdm",
            side: "buy",
            price: 100,
            qty: 1,
          },
          {
            id: "p2",
            time: Date.now(),
            orderId: "o2",
            symbol: "BTCUSDT",
            market: "usdm",
            side: "sell",
            price: 120,
            qty: 1,
          },
        ],
      });
      await new Promise((res) => setTimeout(res, 300));
      // The stats live in the BottomPanel's "表现" tab — activate it first.
      const tabBtn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "表现",
      );
      tabBtn?.click();
      await new Promise((res) => setTimeout(res, 300));
      out.perfTab = !!document.body.innerText.includes("表现");
      out.equityCurve = !!document.body.innerText.includes("已实现权益曲线");
      out.winRateShown = /成交笔数\s*\/\s*胜率/.test(document.body.innerText);
      paperStore.getState().reset();
    } else {
      out.perfTab = "no usePaper";
    }
  } catch (e) {
    out.perfError = String(e);
  }

  // 5. health panel
  try {
    st.setHealthOpen(true);
    await new Promise((res) => setTimeout(res, 300));
    out.healthDialog = !!document.querySelector('[id="health-dialog"]');
    out.healthStats = !!document.body.innerText.includes("重连次数");
    const fs = get().feedStats;
    out.feedStatsTracked = typeof fs?.base === "string" && fs.base.length > 0;
    st.setHealthOpen(false);
  } catch (e) {
    out.healthError = String(e);
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check("risk: maxQty rejects", !!r.riskQty, r.riskError ?? "");
  check("risk: maxNotional rejects", !!r.riskNotional, r.riskError ?? "");
  check("export dialog opens", !!r.exportDialog, r.exportError ?? "");
  check("export presets shown", !!r.exportPresets, r.exportError ?? "");
  check("depth modal opens", !!r.depthDialog, r.depthError ?? "");
  check("depth chart svg renders", !!r.depthSvg, r.depthError ?? "");
  check("performance tab present", !!r.perfTab, r.perfError ?? "");
  check("equity curve panel renders", !!r.equityCurve, r.perfError ?? "");
  check("win-rate stat shown", !!r.winRateShown, r.perfError ?? "");
  check("health panel opens", !!r.healthDialog, r.healthError ?? "");
  check(
    "feed stats tracked (host/base)",
    !!r.feedStatsTracked,
    r.healthError ?? "",
  );
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
