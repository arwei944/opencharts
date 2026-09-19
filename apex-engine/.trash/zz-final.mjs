import fs from "node:fs";
import { chromium } from "playwright";

const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-final.json`;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.evaluate(() => {
  window.__R = { ok: false, f: 0, gaps: [], last: performance.now() };
  const step = () => {
    if (!window.__R.ok) return;
    const now = performance.now();
    window.__R.f++;
    window.__R.gaps.push(Math.round(now - window.__R.last));
    window.__R.last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
await p.evaluate(() => { window.__R.ok = true; });
await p.waitForTimeout(100);

// Baseline idle
let idleCount = 0;
while (idleCount < 5 && (await p.evaluate(() => window.__R?.f ?? 0)) < 10) idleCount++;
const idleStats = await p.evaluate(() => {
  const s = window.__R.gaps.slice().sort((a, x) => a - x);
  return { idleN: s.length, idleP50: s[Math.floor(s.length / 2)] ?? 0 };
});
await p.evaluate(() => { window.__R.f = 0; window.__R.gaps = []; });

await p.waitForFunction(
  () => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""),
  null,
  { timeout: 120000 },
);
await p.mouse.move(700, 400);
await p.waitForTimeout(300);

const BB = { x: 208, y: 124, w: 882, h: 488 };
let ms = 0;
do {
  const start = Date.now();
  const y = BB.y + BB.h * 0.45;
  await p.mouse.move(BB.x + BB.w * 0.8, y);
  await p.mouse.down();
  for (let i = 1; i <= 50; i++) await p.mouse.move(BB.x + BB.w * 0.8 - i * 10, y);
  await p.mouse.up();
  ms = Date.now() - start;
} while (ms < 300);

await p.waitForTimeout(300);
const dragStats = await p.evaluate(() => {
  const s = window.__R.gaps.sort((a, b) => a - b);
  return { dragN: s.length, dragP50: s[Math.floor(s.length / 2)] ?? 0, fps: +(s.reduce((a, x) => a + x, 0) ? ((s.length / s.reduce((a, x) => a + x, 0)) * 1000).toFixed(1) : 0) };
});

const out = JSON.stringify({ ...idleStats, ...dragStats, ms }, null, 2);
fs.writeFileSync(OUT, out);
await ctx.close();
process.exit(0);
