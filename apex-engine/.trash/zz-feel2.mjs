import fs from "node:fs";
import { chromium } from "playwright";

const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-drags2.json`;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
// Inline init script
await p.evaluate(() => {
  window.__D = { ok: false, f: 0, gaps: [], last: performance.now() };
  const step = () => {
    if (!window.__D.ok) return;
    const now = performance.now();
    window.__D.f++;
    window.__D.gaps.push(Math.round(now - window.__D.last));
    window.__D.last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
// Wait until rAF has run
await p.evaluate(() => { window.__D.ok = true; });
for (let i = 0; i < 60 && (await p.evaluate(() => window.__D?.f ?? 0)) < 10; i++) await p.waitForTimeout(16);
await p.waitForFunction(
  () => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""),
  null,
  { timeout: 120000 },
);
await p.mouse.move(700, 400);
await p.waitForTimeout(300);
await p.evaluate(() => { window.__D.f = 0; window.__D.gaps = []; window.__D.last = performance.now(); });

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

await p.waitForTimeout(200);
const result = await p.evaluate(() => {
  const s = window.__D.gaps.sort((a, b) => a - b);
  return {
    n: window.__D.f,
    gaps: window.__D.gaps.length,
    p50: s[Math.floor(s.length / 2)] ?? 0,
    sumMs: s.reduce((a, x) => a + x, 0),
    fps: s.reduce((a, x) => a + x, 0) ? ((s.length / s.reduce((a, x) => a + x, 0)) * 1000).toFixed(1) : 0,
  };
});
const out = JSON.stringify({ ms, ...result }, null, 2);
fs.writeFileSync(OUT, out);
await ctx.close();
process.exit(0);
