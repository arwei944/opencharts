#!/usr/bin/env node
/**
 * Batch 5 headless smoke (mirrors the batch4 verification style): boots the
 * app on the dev server and probes the new features from the exposed store:
 *  - text tool button in the toolbar + text drawing round-trip
 *  - new indicators (DMI/STOCHRSI/MFI/AROON) addable + DMI actually renders
 *  - dataWarnings counters react to reportDataWarning
 *  - side-panel collapse flags toggle
 *  - chart canvas actually paints
 *
 * Requires a playwright install (like mirror-regression.mjs):
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch5-smoke.mjs
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

  // 1. text tool button rendered in the toolbar
  out.textToolBtn = !!document.querySelector('[title="文字"]');

  // 2. text drawing round-trip via store
  try {
    const before = st.drawings.length;
    st.addDrawing({
      id: "probe-text-1",
      tool: "text",
      points: [{ time: 1700000000, price: 100, text: "标注 ABC" }],
      color: "#f0b90b",
    });
    const added = get().drawings.find((d) => d.id === "probe-text-1");
    out.textRoundtrip = !!added && added.points[0].text === "标注 ABC";
    st.updateDrawing("probe-text-1", { color: "#0ecb81" });
    const updated = get().drawings.find((d) => d.id === "probe-text-1");
    out.textUpdate =
      updated?.color === "#0ecb81" && updated.points[0].text === "标注 ABC";
    st.removeDrawing("probe-text-1");
    out.textRemove =
      !get().drawings.some((d) => d.id === "probe-text-1") &&
      get().drawings.length === before;
  } catch (e) {
    out.textRoundtrip = out.textUpdate = out.textRemove = false;
    out.textError = String(e);
  }

  // 3. new indicators addable through the store
  out.newIndicators = {};
  for (const kind of ["DMI", "STOCHRSI", "MFI", "AROON"]) {
    try {
      const id = st.addIndicator(kind);
      // read the fresh state — the pre-add snapshot is stale by design
      const fresh = get().indicators;
      out.newIndicators[kind] = !!fresh.find(
        (i) => i.id === id && i.kind === kind,
      );
      if (id) get().removeIndicator(id);
    } catch (e) {
      out.newIndicators[kind] = "error: " + String(e);
    }
  }

  // 4. DMI actually renders a sub-pane (engine panes grow). The resident series
  // must have real history first: while the prefill is frozen the dashboard
  // parks bars at 1 and indicator panes never materialize (no data -> no series).
  let eng = null;
  for (let t = 0; t < 20; t++) {
    eng = (window.__chartEngines || []).find(
      (e) => (e.bars?.length || 0) > 1000,
    );
    if (eng) break;
    await new Promise((res) => setTimeout(res, 1000));
  }
  if (eng) {
    const beforePanes = eng.chart.panes().length;
    st.addIndicator("DMI");
    // Full-history indicator compute + per-frame pane creation can exceed
    // 800ms on a loaded page; 2s keeps the assertion stable under load.
    await new Promise((res) => setTimeout(res, 2000));
    const afterPanes = eng.chart.panes().length;
    out.dmiRenders = afterPanes > beforePanes;
    const idx = get().indicators.findIndex((i) => i.kind === "DMI");
    if (idx >= 0) get().removeIndicator(get().indicators[idx].id);
  } else {
    out.dmiRenders = "skipped (history not landed)";
  }

  // 5. dataWarnings counters
  const w0 = { ...st.dataWarnings };
  st.reportDataWarning({ gaps: 2, anomalies: 1 });
  const w1 = get().dataWarnings;
  out.warnings = w1.gaps === w0.gaps + 2 && w1.anomalies === w0.anomalies + 1;

  // 6. panel collapse flags
  st.setLeftPanelOpen(false);
  st.setRightPanelOpen(false);
  out.panelsCollapse =
    get().leftPanelOpen === false && get().rightPanelOpen === false;
  st.setLeftPanelOpen(true);
  st.setRightPanelOpen(true);

  // 7. canvas painted
  const canvas = document.querySelector("canvas");
  let drawn = false;
  if (canvas) {
    try {
      const img = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 3; i < img.length; i += 4) if (img[i] !== 0) n++;
      drawn = n > 500;
    } catch {
      /* tainted */
    }
  }
  out.canvasDrawn = drawn;

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check("text tool button rendered", !!r.textToolBtn);
  check(
    "text drawing round-trip (add/update/remove)",
    !!r.textRoundtrip && !!r.textUpdate && !!r.textRemove,
    r.textError ?? "",
  );
  for (const kind of ["DMI", "STOCHRSI", "MFI", "AROON"]) {
    check(
      `indicator ${kind} addable`,
      r.newIndicators?.[kind] === true,
      String(r.newIndicators?.[kind]),
    );
  }
  check("DMI renders sub-pane", r.dmiRenders === true, String(r.dmiRenders));
  check("dataWarnings counters", !!r.warnings);
  check("panel collapse flags", !!r.panelsCollapse);
  check("chart canvas painted", !!r.canvasDrawn);
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
