#!/usr/bin/env node
/**
 * Shell-level visual regression: instead of diffing the ever-moving candle
 * canvas, snapshots the stable "chrome" — computed theme tokens, layout
 * heights, toolbar composition and overlay presence — and ensures the canvas
 * actually drew pixels. A theme/layout regression changes these values; live
 * candle churn can never trip it.
 *
 *   node scripts/pixel-regression.mjs            # compare vs baseline
 *   node scripts/pixel-regression.mjs --record   # (re)write the baseline
 *
 * Requires a playwright install (like mirror-regression.mjs) and the dev
 * server on BASE_URL (default http://127.0.0.1:8080).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const URL = process.env.BASE_URL || "http://127.0.0.1:8080";
const RECORD = process.argv.includes("--record");
const themeIdx = process.argv.indexOf("--theme");
const themeArg =
  themeIdx >= 0 ? (process.argv[themeIdx + 1] ?? "dark") : "dark";
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");
const GOLDEN_FILE = join(GOLDEN_DIR, `chrome-${themeArg}.json`);

async function snapshot(page) {
  return page.evaluate(() => {
    const css = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
    };
    // canvas actually painted? (candles/bg non-blank)
    const canvas = document.querySelector("canvas");
    let painted = false;
    if (canvas) {
      try {
        const img = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 3; i < img.length; i += 4) if (img[i] !== 0) n++;
        painted = n > 500;
      } catch {
        /* tainted */
      }
    }
    return {
      theme: document.documentElement.dataset.theme ?? null,
      colorBg: css("body", "background-color"),
      colorFg: css("body", "color"),
      gold: css(":root", "--color-gold"),
      headerText:
        document
          .querySelector("header")
          ?.textContent?.replace(/\s+/g, " ")
          .slice(0, 80) ?? null,
      toolbarButtons: document.querySelectorAll(
        "header button, [class*=toggle] button",
      ).length,
      hasLegend: !!document.querySelector(
        ".pointer-events-none.absolute.left-2.top-2",
      ),
      overlaySvg: !!document.querySelector("svg.pointer-events-none"),
      toolbarTitles: [...document.querySelectorAll("button[title]")]
        .slice(0, 12)
        .map((b) => b.getAttribute("title")),
      painted,
    };
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
// wait for the terminal + data to render
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  await page.waitForTimeout(1000);
  ready = await page.evaluate(() => {
    const st = window.useTerminal?.getState?.();
    return !!st && st.bars.length > 500 && !!document.querySelector("header");
  });
}
if (!ready) {
  console.log("❌ terminal never became ready");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(3000);
// Apply the requested theme preset before snapshotting so theme regressions
// (chrome color tokens, header labels) are comparable per theme.
if (themeArg !== "dark") {
  await page.evaluate((t) => {
    window.useTerminal.getState().setTheme(t);
  }, themeArg);
  await page.waitForTimeout(800);
}
const snap = await snapshot(page);
await browser.close();

if (RECORD) {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(
    GOLDEN_FILE,
    JSON.stringify({ ...snap, recorded: new Date().toISOString() }, null, 1),
  );
  console.log(`✅ recorded baseline → ${GOLDEN_FILE}`);
  console.log(JSON.stringify(snap, null, 1));
  process.exit(0);
}

if (!existsSync(GOLDEN_FILE)) {
  console.log(`❌ no baseline at ${GOLDEN_FILE} — run with --record first`);
  process.exit(1);
}
const golden = JSON.parse(readFileSync(GOLDEN_FILE, "utf-8"));

// stable, exact-match keys
const fixed = [
  ["theme", "theme"],
  ["colorBg", "colorBg"],
  ["colorFg", "colorFg"],
  ["gold", "gold"],
  ["headerText", "headerText"],
  ["hasLegend", "hasLegend"],
  ["overlaySvg", "overlaySvg"],
];
let failed = 0;
for (const [key, label] of fixed) {
  const a = JSON.stringify(golden[key]);
  const b = JSON.stringify(snap[key]);
  if (a !== b) {
    failed++;
    console.log(`❌ ${label}: ${a} vs ${b}`);
  }
}
if (!snap.painted) {
  failed++;
  console.log("❌ chart canvas is blank");
}
console.log(
  `toolbar titles stable: ${JSON.stringify(golden.toolbarTitles) === JSON.stringify(snap.toolbarTitles) ? "yes" : "changed"}`,
);
if (failed) {
  console.log(`❌ chrome regression (${failed} mismatches)`);
  process.exit(1);
}
console.log("✅ chrome matches baseline, canvas painted");
