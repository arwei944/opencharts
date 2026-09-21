#!/usr/bin/env node
/**
 * Closing-batch smoke (round 6): drawing property panel, indicator presets,
 * arrow tool — plus the four-theme pixel baselines compare.
 *
 *   npm run dev &
 *   BASE_URL=http://127.0.0.1:8080 node scripts/batch10-smoke.mjs
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
  const last = st.bars.at(-1);
  const prev = st.bars.at(-2) ?? last;

  // 1. drawing property panel: update color/width -> chart reflects width
  try {
    st.addDrawing({
      id: "prop-1",
      tool: "trend",
      points: [
        { time: prev.time, price: last.close },
        { time: last.time, price: last.close * 0.99 },
      ],
      color: "#f0b90b",
    });
    st.selectDrawing("prop-1");
    st.updateDrawing("prop-1", { color: "#0ecb81", width: 3 });
    await new Promise((res) => setTimeout(res, 400));
    // the selected drawing's line is rendered with strokeWidth 3
    const strokes = [
      ...document.querySelectorAll("svg.pointer-events-none line"),
    ]
      .map((l) => Number(l.getAttribute("stroke-width")))
      .filter((w) => w === 3);
    out.widthApplied = strokes.length >= 1;
    st.updateDrawing("prop-1", { width: 1 });
    await new Promise((res) => setTimeout(res, 200));
    out.widthReverted = ![
      ...document.querySelectorAll("svg.pointer-events-none line"),
    ].some((l) => Number(l.getAttribute("stroke-width")) === 3);
    st.removeDrawing("prop-1");
  } catch (e) {
    out.propError = String(e);
  }

  // 2. indicator preset: apply replaces with exactly the preset members
  try {
    st.applyIndicatorPreset([
      { kind: "RSI", params: [14] },
      { kind: "MACD" },
      { kind: "VOL" },
    ]);
    await new Promise((res) => setTimeout(res, 300));
    const kinds = get()
      .indicators.map((i) => i.kind)
      .sort()
      .join(",");
    out.presetApplied = kinds === "MACD,RSI,VOL";
    out.presetDetail = kinds;
  } catch (e) {
    out.presetError = String(e);
  }

  // 3. arrow tool: drawing with tool "arrow" renders a polygon arrowhead
  try {
    st.addDrawing({
      id: "arrow-1",
      tool: "arrow",
      points: [
        { time: prev.time, price: last.close },
        { time: last.time, price: last.close * 0.98 },
      ],
      color: "#f0b90b",
    });
    await new Promise((res) => setTimeout(res, 400));
    out.arrowDrawn = !!document.querySelector(
      "svg.pointer-events-none polygon",
    );
    st.removeDrawing("arrow-1");
  } catch (e) {
    out.arrowError = String(e);
  }

  // 4. toolbar now lists the arrow tool button
  out.arrowButton = !!document.querySelector('[title="箭头"]');

  return out;
});

if (r.error) {
  check("probe booted", false, r.error);
} else {
  check(
    "property panel width applies to chart",
    !!r.widthApplied,
    r.propError ?? "",
  );
  check("property width reverts", !!r.widthReverted, r.propError ?? "");
  check(
    "indicator preset replaces group",
    !!r.presetApplied,
    r.presetDetail ?? "",
  );
  check(
    "arrow tool renders arrowhead polygon",
    !!r.arrowDrawn,
    r.arrowError ?? "",
  );
  check("arrow tool button in toolbar", !!r.arrowButton, "");
}
if (errors.length) {
  console.log("page errors:");
  for (const e of errors.slice(0, 5)) console.log("  " + e);
}
console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
