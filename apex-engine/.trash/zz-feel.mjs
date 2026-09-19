import fs from "node:fs";
import { chromium } from "playwright";

// Real-world feel: mouse moves at ~60/s while dragging, and each move should
// ACK within ~16ms (so we can do 60+ frames per second). We time how long each
// mousemove takes to complete as measured by the time between sending it and
// seeing a visible response (chart pan via rAF).
const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-drags.json`;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();

await ctx.addInitScript(() => {
  window.__t = { ok: false, t0: 0, lastRAF: performance.now() };
  const step = () => {
    if (!window.__t.ok) return;
    const now = performance.now();
    window.__t.f = (window.__t.f ?? 0) + 1;
    window.__t.gaps.push(Math.round(now - window.__t.lastRAF));
    window.__t.lastRAF = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.evaluate(() => {
  window.__t = { ok: false, t0: 0, lastRAF: performance.now(), f: 0, gaps: [] };
  const step = () => {
    if (!window.__t.ok) return;
    const now = performance.now();
    window.__t.f += 1;
    window.__t.gaps.push(Math.round(now - window.__t.lastRAF));
    window.__t.lastRAF = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
// Wait until rAF loop has been running a bit
for (let i = 0; i < 60 && (await p.evaluate(() => window.__t?.f ?? 0)) < 10; i++) await p.waitForTimeout(16);
await p.waitForFunction(
  () => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""),
  null,
  { timeout: 120000 },
);
await p.mouse.move(700, 400);
await p.waitForTimeout(300);
await p.evaluate(() => { window.__t.ok = true; window.__t.t0 = performance.now(); window.__t.lastRAF = performance.now(); });

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

await p.waitForTimeout(100);
const stats = await p.evaluate(() => {
  const s = window.__t.gaps.sort((a, b) => a - b);
  return { n: window.__t.f, gaps: window.__t.gaps.length, p50: s[Math.floor(s.length / 2)] ?? 0, fps: +(window.__t.gaps.reduce((a, x) => a + x, 0) ? ((window.__t.gaps.length / window.__t.gaps.reduce((a, x) => a + x, 0)) * 1000).toFixed(1) : 0) };
});
const out = JSON.stringify({ ms, ...stats }, null, 2);
fs.writeFileSync(OUT, out);
await ctx.close();
process.exit(0);
