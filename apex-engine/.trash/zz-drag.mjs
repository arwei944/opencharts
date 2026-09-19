import fs from "node:fs";
import { chromium } from "playwright";

// Steady-state drag: what eats the frames? Samples the CPU profile while the
// mouse is held down and moving, and records per-frame canvas movement so a pan
// that trails the cursor shows up as frames with no pixel change.
const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-drag.json`;
const r = { ok: false, startedAt: new Date().toISOString() };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__f = { frames: 0, gaps: [], t0: performance.now() };
  let last = performance.now();
  const step = (t) => {
    const dt = t - last;
    last = t;
    window.__f.frames++;
    if (dt > 20) window.__f.gaps.push(Math.round(dt));
    if (window.__f.sample) window.__f.sample();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Per-frame checksum of a band of the chart canvas: no change while the mouse
  // moves means the picture is not following the pointer.
  window.__f.sample = () => {
    const c = [...document.querySelectorAll("canvas")].sort((a, x) => x.width * x.height - a.width * a.height)[0];
    if (!c) return;
    const g = c.getContext("2d");
    const d = g.getImageData(60, 40, 200, 120).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 16) s = (s + i + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) % 2147483647;
    if (s === window.__f.last) window.__f.stale++;
    else window.__f.fresh++;
    window.__f.last = s;
  };
  window.__f.fresh = 0;
  window.__f.stale = 0;
});

const p = await ctx.newPage();
p.setDefaultTimeout(20000);
const cdp = await ctx.newCDPSession(p);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.waitForFunction(() => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""), null, { timeout: 120000 });
r.badge = await p.evaluate(() => [...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)));

const BB = { x: 208, y: 124, w: 882, h: 488 };
async function sweepDrag(reps = 4) {
  const y = BB.y + BB.h * 0.4;
  await p.evaluate(() => {
    window.__f.frames = 0;
    window.__f.gaps = [];
    window.__f.fresh = 0;
    window.__f.stale = 0;
  });
  const t0 = Date.now();
  for (let i = 0; i < reps; i++) {
    await p.mouse.move(BB.x + BB.w * 0.75, y);
    await p.mouse.down();
    // ~16px steps: a normal-speed pan, 60 moves per sweep.
    for (let s = 1; s <= 60; s++) await p.mouse.move(BB.x + BB.w * 0.75 - s * 10, y);
    await p.mouse.up();
  }
  const ms = Date.now() - t0;
  const stats = await p.evaluate(() => ({
    frames: window.__f.frames,
    fresh: window.__f.fresh,
    stale: window.__f.stale,
    gaps: window.__f.gaps.slice().sort((a, x) => x - a).slice(0, 8),
    p50: window.__f.gaps.slice().sort((a, x) => a - x)[Math.floor(window.__f.gaps.length / 2)] ?? 0,
  }));
  return { ms, ...stats };
}

await cdp.send("Profiler.start");
r.drag = await sweepDrag(6);
const prof = await cdp.send("Profiler.stop");
const byFn = new Map();
const deltas = r.drag.ms / (r.drag.frames || 1);
for (const n of prof.profile.nodes) {
  const self = (prof.profile.samples || []).filter((s) => s === n.id).length;
  if (!self) continue;
  const key = `${n.callFrame.functionName || "(anon)"} @${(n.callFrame.url || "").split("/").pop()}:${n.callFrame.lineNumber}`;
  byFn.set(key, (byFn.get(key) ?? 0) + self);
}
const total = [...byFn.values()].reduce((a, x) => a + x, 0) || 1;
r.hot = [...byFn.entries()]
  .sort((a, x) => x[1] - a[1])
  .slice(0, 18)
  .map(([fn, n]) => ({ fn, pct: +((n / total) * 100).toFixed(1) }));
r.framesPerDragMs = +(r.drag.frames / r.drag.ms).toFixed(1);
r.ok = true;
flush();
await b.close();
process.exit(0);
