import fs from "node:fs";
import { chromium } from "playwright";

// Steady-state drag cost, measured without any per-frame canvas readback (that
// readback costs more than the frame it measures). Baseline = same page, mouse
// still; drag = button held, 12 moves/second.
const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-drag2.json`;
const r = { ok: false, startedAt: new Date().toISOString() };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__m = { frames: 0, gaps: [], moves: 0, on: false };
  let last = performance.now();
  const step = (t) => {
    const dt = t - last;
    last = t;
    if (window.__m.on) {
      window.__m.frames++;
      window.__m.gaps.push(Math.round(dt));
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  window.addEventListener(
    "pointermove",
    () => {
      if (window.__m.on) window.__m.moves++;
    },
    true,
  );
});

const p = await ctx.newPage();
p.setDefaultTimeout(20000);
const cdp = await ctx.newCDPSession(p);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 250 });

await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.waitForFunction(
  () => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""),
  null,
  { timeout: 120000 },
);
await p.mouse.move(700, 400);

const stat = (gaps) => {
  const s = gaps.slice().sort((a, x) => a - x);
  const q = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
  return { n: s.length, p50: q(0.5), p90: q(0.9), worst: s[s.length - 1] ?? 0, fps: +((s.length / (s.reduce((a, x) => a + x, 0) || 1)) * 1000).toFixed(1) };
};

const window_ = async (label, fn) => {
  await p.evaluate(() => {
    window.__m.frames = 0;
    window.__m.gaps = [];
    window.__m.moves = 0;
    window.__m.on = true;
  });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  const prof = await cdp.send("Profiler.stop");
  await p.evaluate(() => {
    window.__m.on = false;
  });
  const byFn = new Map();
  for (const n of prof.profile.nodes) {
    const self = (prof.profile.samples || []).filter((s) => s === n.id).length;
    if (self) byFn.set(`${n.callFrame.functionName || "(anon)"} @${(n.callFrame.url || "").split("/").pop()}`, (byFn.get(n.callFrame.functionName || "(anon)") ?? 0) + self);
  }
  const total = [...byFn.values()].reduce((a, x) => a + x, 0) || 1;
  const s = await p.evaluate(() => ({ frames: window.__m.frames, gaps: window.__m.gaps, moves: window.__m.moves }));
  r[label] = { ms, moves: s.moves, ...stat(s.gaps), hot: [...byFn.entries()].sort((a, x) => x[1] - a[1]).slice(0, 12).map(([fn, n]) => ({ fn, pct: +((n / total) * 100).toFixed(1) })) };
  flush();
};

// Baseline: same page, live ticks and the tape running, nobody touching it.
await window_("baseline", () => p.waitForTimeout(12000));

const BB = { x: 208, y: 124, w: 882, h: 488 };
await window_("drag", async () => {
  const y = BB.y + BB.h * 0.4;
  for (let i = 0; i < 6; i++) {
    await p.mouse.move(BB.x + BB.w * 0.78, y);
    await p.mouse.down();
    for (let s = 1; s <= 60; s++) await p.mouse.move(BB.x + BB.w * 0.78 - s * 10, y);
    await p.mouse.up();
  }
});

r.ok = true;
flush();
await b.close();
process.exit(0);
