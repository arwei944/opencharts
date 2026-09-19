import fs from "node:fs";
import { chromium } from "playwright";

// Minimal drag responsiveness measurement: frame gap p50 during mouse held down
const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-drag3.json`;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();

await ctx.addInitScript(() => {
  window.__d = { ok: false, t0: performance.now(), last: performance.now(), g: [], m: 0 };
  const step = (t) => {
    const dt = t - window.__d.last;
    window.__d.last = t;
    if (window.__d.ok) {
      window.__d.g.push(Math.round(dt));
      if (window.__d.m) window.__d.g.push(999); // marker for moved frames
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.mouse.move(700, 400);
await p.waitForFunction(() => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""), null, { timeout: 120000 });
await p.evaluate(() => { window.__d.ok = true; window.__d.t0 = performance.now(); window.__d.last = performance.now(); window.__d.g = []; window.__d.m = 0; });
await p.waitForTimeout(500);

const BB = { x: 208, y: 124, w: 882, h: 488 };
async function sweep() {
  const y = BB.y + BB.h * 0.4;
  const t0 = Date.now();
  await p.mouse.move(BB.x + BB.w * 0.8, y);
  await p.mouse.down();
  for (let i = 1; i <= 80; i++) await p.mouse.move(BB.x + BB.w * 0.8 - i * 10, y);
  await p.mouse.up();
  return Date.now() - t0;
}

let ms = 0;
do {
  ms = await sweep();
} while (ms < 200);
await p.waitForTimeout(100);
const out = await p.evaluate(() => {
  const gaps = window.__d.g.filter((_, i) => i % 2 === 0).sort((a, b) => a - b);
  return JSON.stringify({
    ms: (performance.now() - window.__d.t0),
    n: window.__d.g.length,
    gapsCount: gaps.length,
    p50: gaps[Math.floor(gaps.length / 2)] ?? 0,
    p90: gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.9))] ?? 0,
    sumMs: gaps.reduce((a, x) => a + x, 0),
    fps: gaps.reduce((a, x) => a + x, 0) ? ((gaps.length / gaps.reduce((a, x) => a + x, 0)) * 1000).toFixed(1) : 0,
  });
});
fs.writeFileSync(OUT, out);
await ctx.close();
process.exit(0);
