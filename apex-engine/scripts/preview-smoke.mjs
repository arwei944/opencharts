#!/usr/bin/env node
/**
 * Build-output smoke: runs against the preview server (vite preview on :8081,
 * or BASE_URL override) and asserts the production bundle actually renders the
 * terminal (K-line canvas, connection indicator, legend) with no page errors.
 *
 * Requires an external playwright install (the repo does not ship it):
 *   npm run build            # produces .vercel output / preview assets
 *   npm run preview &        # serves :8081
 *   node scripts/preview-smoke.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8081";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|manifest|fonts\.g/.test(m.text()))
    errors.push(m.text());
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
// give the lazy terminal chunk + history fill time to arrive
await page.waitForTimeout(15000);

const probe = await page.evaluate(() => {
  const st = window.useTerminal?.getState?.();
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
      /* ignore */
    }
  }
  return {
    hasStore: !!st,
    bars: st?.bars?.length ?? 0,
    conn: st?.conn ?? "n/a",
    canvasDrawn: drawn,
    legendText:
      document.body.innerText.includes("开") &&
      document.body.innerText.includes("高"),
  };
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

check("store hydrated", probe.hasStore);
check("kline bars loaded", probe.bars > 1000, `${probe.bars}`);
check("connection live", probe.conn === "live", probe.conn);
check("canvas drawn (candles visible)", probe.canvasDrawn);
check("legend OHLC present", probe.legendText);
check("no page errors", errors.length === 0, errors.slice(0, 3).join("; "));

await browser.close();
console.log(
  failures ? `\n✖ ${failures} check(s) failed` : "\n✔ preview smoke OK",
);
process.exit(failures ? 1 : 0);
