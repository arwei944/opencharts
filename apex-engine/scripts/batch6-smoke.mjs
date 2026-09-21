#!/usr/bin/env node
/**
 * Batch 6 headless smoke: probes the new features from the exposed store +
 * dev-only __chartEngines:
 *  - drawings panel opens and visibility toggling hides the SVG node
 *  - minimap strip mounts and tracks engine.onMinimap
 *  - zoomAt shrinks the visible logical range (double-click zoom)
 *  - themePref "system" resolves theme from prefers-color-scheme
 *  - fontSize / pricePrecision apply to the live chart options
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch6-smoke.mjs
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

  // 1. drawings panel opens; visibility toggle hides the drawing in the overlay
  try {
    const lastBar = st.bars.at(-1);
    st.addDrawing({
      id: "probe-panel-1",
      tool: "text",
      points: [{ time: lastBar.time, price: lastBar.close, text: "面板探测" }],
      color: "#f0b90b",
    });
    st.setDrawingsOpen(true);
    await new Promise((res) => setTimeout(res, 400));
    out.panelOpen = !!document.querySelector('[id="drawings-title"]');
    st.setDrawingsOpen(false);
    st.updateDrawing("probe-panel-1", { visible: false });
    await new Promise((res) => setTimeout(res, 300));
    out.hiddenGone = !document.body.innerHTML.includes("面板探测");
    st.updateDrawing("probe-panel-1", { visible: true });
    await new Promise((res) => setTimeout(res, 300));
    out.visibleBack = document.body.innerHTML.includes("面板探测");
    st.removeDrawing("probe-panel-1");
  } catch (e) {
    out.panelError = String(e);
  }

  // 2. minimap strip mounts and the slider tracks the visible range
  try {
    const eng = (window.__chartEngines || []).find(
      (e) => (e.bars?.length || 0) > 0,
    );
    const sliders = () =>
      [...document.querySelectorAll("div")].filter((d) =>
        d.className.includes("bg-gold/80"),
      );
    out.minimapMounted = sliders().length > 0;
    if (eng) {
      const bars = st.bars;
      const mid = bars[Math.floor(bars.length / 2)];
      eng.onMinimap?.({ from: mid.time - 1000, to: mid.time + 1000 });
      await new Promise((res) => setTimeout(res, 60));
      // The mobile (hidden) branch renders a second pane+slider; the visible
      // desktop one must have been updated imperatively.
      out.minimapTracks = sliders().some(
        (s) => s.style.opacity === "1" && s.style.left !== "",
      );
    } else {
      out.minimapTracks = "skipped";
    }
  } catch (e) {
    out.minimapError = String(e);
  }

  // 3. zoomAt shrinks the visible logical range
  try {
    const eng = (window.__chartEngines || []).find(
      (e) => (e.bars?.length || 0) > 0,
    );
    if (eng) {
      // Give the test a definite wide viewport first — at the tightest zoom
      // (span 1) lw-charts clamps setVisibleLogicalRange back to 1 by design.
      eng.chart.timeScale().setVisibleLogicalRange({ from: 100, to: 200 });
      await new Promise((res) => setTimeout(res, 60));
      const before = eng.chart.timeScale().getVisibleLogicalRange();
      const spanB = before.to - before.from;
      eng.zoomAt(200, 800, 1.6);
      await new Promise((res) => setTimeout(res, 150));
      const after = eng.chart.timeScale().getVisibleLogicalRange();
      const spanA = after ? after.to - after.from : spanB;
      out.zoomShrinks = spanA < spanB * 0.75;
      out.zoomDetail = `span ${spanB.toFixed(1)} -> ${spanA.toFixed(1)}`;
    } else {
      out.zoomShrinks = "skipped";
    }
  } catch (e) {
    out.zoomError = String(e);
  }

  // 4. themePref "system" resolves from prefers-color-scheme
  try {
    const osDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    st.setThemePref("system");
    await new Promise((res) => setTimeout(res, 150));
    const resolved = get().theme;
    out.themeSystem = osDark ? resolved === "dark" : resolved === "light";
    out.themeSystemDetail = `os=${osDark} resolved=${resolved}`;
  } catch (e) {
    out.themeError = String(e);
  }

  // 5. fontSize + pricePrecision apply to the live chart
  try {
    const eng = (window.__chartEngines || []).find(
      (e) => (e.bars?.length || 0) > 0,
    );
    const s = { ...st.chartSettings, fontSize: 15, pricePrecision: 2 };
    st.setChartSettings(s);
    await new Promise((res) => setTimeout(res, 300));
    const opts = eng?.chart.options() ?? {};
    out.fontApplied = opts.layout?.fontSize === 15;
    const mainOpts = eng?.main?.options?.() ?? {};
    out.precisionApplied = mainOpts.priceFormat?.precision === 2;
  } catch (e) {
    out.fontError = String(e);
  }

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check("drawings panel opens", !!r.panelOpen, r.panelError ?? "");
  check(
    "hidden drawing removed from overlay",
    !!r.hiddenGone,
    r.panelError ?? "",
  );
  check(
    "re-shown drawing back in overlay",
    !!r.visibleBack,
    r.panelError ?? "",
  );
  check("minimap strip mounted", !!r.minimapMounted, r.minimapError ?? "");
  check(
    "minimap slider tracks range",
    r.minimapTracks === true,
    String(r.minimapTracks),
  );
  check(
    "double-click zoom shrinks range",
    r.zoomShrinks === true,
    (r.zoomDetail ?? "") + " " + (r.zoomError ?? ""),
  );
  check("theme follows system", !!r.themeSystem, r.themeSystemDetail ?? "");
  check("fontSize applied to chart", !!r.fontApplied, r.fontError ?? "");
  check(
    "pricePrecision applied to series",
    !!r.precisionApplied,
    r.fontError ?? "",
  );
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
