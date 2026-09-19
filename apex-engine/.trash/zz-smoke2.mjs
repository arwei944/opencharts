import fs from "node:fs";
import { chromium } from "playwright";

// Does the page stay responsive while the background fill is still running?
// Per-window fps (not cumulative) plus every frame gap over 120ms, so a slow
// CDP round trip cannot be mistaken for a wedged renderer.
// Usage: node .trash/zz-smoke2.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 200) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-smoke2.json`;
const r = { ok: false, windows: [], startedAt: new Date().toISOString() };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const flush = () => {
  fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
  log("flushed");
};
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__t0 = performance.now();
  window.__doc = Number(sessionStorage.getItem("__doc") || 0) + 1;
  sessionStorage.setItem("__doc", String(window.__doc));
  window.__f = { frames: 0, last: performance.now(), gaps: [] };
  const step = (t) => {
    const f = window.__f;
    const dt = t - f.last;
    f.last = t;
    f.frames++;
    if (dt > 120) f.gaps.push(Math.round(dt));
    if (f.gaps.length > 500) f.gaps.splice(0, f.gaps.length - 500);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
  }).observe({ entryTypes: ["longtask"] });
});

const p = await ctx.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => {
  r.pageErrors = [...(r.pageErrors ?? []), String(e).split("\n").slice(0, 3).join(" | ")].slice(0, 5);
  flush();
});

const race = (pr, ms, tag) => Promise.race([pr, new Promise((res) => setTimeout(() => res(tag), ms))]);
const BB = { x: 208, y: 124, w: 882, h: 488 };

async function drag(n) {
  const y = BB.y + BB.h * 0.5;
  const ops = (async () => {
    for (let i = 0; i < n; i++) {
      await p.mouse.move(BB.x + BB.w * 0.6, y);
      await p.mouse.down();
      for (let s = 1; s <= 5; s++) await p.mouse.move(BB.x + BB.w * (0.6 - 0.09 * s), y);
      await p.mouse.up();
    }
  })();
  return race(ops, 25000, "drag-stalled");
}

const mark = () =>
  race(
    p.evaluate(() => ({
      f: window.__f.frames,
      t: performance.now() - window.__t0,
      gaps: window.__f.gaps.slice(-300),
      gapCount: window.__f.gaps.length,
      long: window.__long.length,
      badge: [...document.querySelectorAll("span")]
        .map((e) => e.textContent.trim())
        .find((x) => /^(完整 [\d,]+ 根|后台补齐)/.test(x)),
    })),
    10000,
    null,
  );

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(p.waitForFunction(() => document.querySelector("canvas") && window.__f.frames > 2, undefined, { timeout: 40000 }), 45000);
  await race(p.waitForFunction(() => /后台补齐/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).join("|")), undefined, { timeout: 30000 }), 35000);

  let prev = await mark();
  for (let k = 0; k < 8; k++) {
    const dragResult = await drag(3);
    const now = await mark();
    if (!prev || !now) {
      r.windows.push({ k, stalled: true, dragResult });
      prev = now ?? prev;
      flush();
      continue;
    }
    const secs = (now.t - prev.t) / 1000;
    r.windows.push({
      k,
      atMs: Math.round(now.t),
      badge: now.badge,
      fps: +(((now.f - prev.f) / Math.max(secs, 0.001))).toFixed(1),
      gapFrames: now.gapCount - prev.gapCount,
      worstGapRecent: Math.max(0, ...now.gaps),
      newLong: now.long - prev.long,
      dragResult,
    });
    prev = now;
    flush();
  }
  r.ok = r.windows.length > 0 && r.windows.every((w) => !w.stalled && w.dragResult !== "drag-stalled");
} catch (e) {
  r.error = String(e).split("\n").slice(0, 4).join(" | ");
}
clearTimeout(watchdog);
flush();
await b.close();
process.exit(0);
