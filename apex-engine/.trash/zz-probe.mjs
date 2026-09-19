import fs from "node:fs";
import { chromium } from "playwright";

// Usage: node .trash/zz-probe.mjs [seconds]
// One lifecycle, matching what a real user gets: empty cache -> backfill (drag
// through it) -> one reveal -> steady state -> four panes hydrated from cache.
const BUDGET_MS = Number(process.argv[2] ?? 480) * 1000;
const OUT = ".trash/probe.json";

const URL = "http://127.0.0.1:8080/";
const r = { ok: false, phases: [], startedAt: new Date().toISOString() };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
// A hung CDP call must not swallow the run: dump what we have and die.
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__klines = 0;
  window.__wsTicks = 0;
  window.__wsSockets = 0;
  window.__perf = [];
  window.__t0 = performance.now();
  const origFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const u = String(args[0]?.url ?? args[0]);
    const seg = u.split("?")[0].split("/").pop() ?? "";
    let meta = "";
    try {
      meta = atob(seg + "=".repeat((4 - (seg.length % 4)) % 4));
    } catch {
      meta = "";
    }
    if (meta.includes("fetchKlines")) window.__klines++;
    return origFetch(...args);
  };
  const WS = window.WebSocket;
  class CountingWS extends WS {
    constructor(url, protocols) {
      super(url, protocols);
      const kline = String(url).includes("kline");
      if (kline) window.__wsSockets++;
      this.addEventListener("message", () => {
        if (kline) window.__wsTicks++;
      });
    }
  }
  window.WebSocket = CountingWS;

  window.__reset = () => {
    window.__f = { frames: 0, maxGap: 0, over50: 0, over100: 0, longTasks: 0, maxTask: 0, last: performance.now() };
    window.__perf = [];
    window.__klines = 0;
  };
  window.__reset();
  const step = (t) => {
    const f = window.__f;
    const dt = t - f.last;
    f.last = t;
    f.frames++;
    if (dt > f.maxGap) f.maxGap = dt;
    if (dt > 50) f.over50++;
    if (dt > 100) f.over100++;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  new PerformanceObserver((list) => {
    const f = window.__f;
    for (const e of list.getEntries()) {
      f.longTasks++;
      if (e.duration > f.maxTask) f.maxTask = e.duration;
    }
  }).observe({ entryTypes: ["longtask"] });
});

const p = await ctx.newPage();
p.setDefaultTimeout(20000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));

const badges = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("span")]
      .map((el) => el.textContent.trim())
      .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t)),
  );

const ink = () =>
  p.evaluate(() => {
    let best = null;
    let area = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const rr = c.getBoundingClientRect();
      if (rr.width > 200 && rr.height > 120 && rr.width * rr.height > area) {
        area = rr.width * rr.height;
        best = c;
      }
    }
    if (!best) return null;
    const w = best.width;
    const h = best.height;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const c2 = off.getContext("2d");
    c2.drawImage(best, 0, 0);
    const xEnd = Math.floor(w * 0.25);
    const img = c2.getImageData(0, 0, xEnd, h).data;
    let inked = 0;
    for (let i = 0; i < img.length; i += 16) {
      const R = img[i];
      const G = img[i + 1];
      const B = img[i + 2];
      const dark = Math.abs(R - 11) < 12 && Math.abs(G - 14) < 12 && Math.abs(B - 17) < 12;
      if (!dark && !(R > 244 && G > 244 && B > 244)) inked++;
    }
    return +(inked / ((xEnd * h) / 4)).toFixed(4);
  });

const snap = async (what, extra) => {
  const v = await p
    .evaluate(
      (w) => {
        const f = window.__f;
        const out = {
          what: w.what,
          atMs: Math.round(performance.now() - window.__t0),
          frames: f.frames,
          maxGap: +f.maxGap.toFixed(1),
          over50: f.over50,
          over100: f.over100,
          longTasks: f.longTasks,
          maxTask: +f.maxTask.toFixed(1),
          klines: window.__klines,
          wsTicksDuring: window.__wsTicks - (window.__wsMark ?? 0),
          perf: window.__perf.filter((e) => e[0].startsWith("applyBars") || e[0].startsWith("rest(")).slice(-16),
          cacheWrites: window.__perf.filter((e) => e[0].startsWith("idbPut")).slice(-2),
          extra: w.extra,
        };
        window.__wsMark = window.__wsTicks;
        window.__reset();
        return out;
      },
      { what, extra: Array.isArray(extra) ? extra : String(extra ?? "") },
    )
    .catch((e) => ({ what, error: String(e).slice(0, 120) }));
  v.ink = await ink().catch(() => null);
  r.phases.push(v);
  flush();
  return v;
};

const boxes = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("canvas")]
      .map((c) => c.getBoundingClientRect())
      .filter((rr) => rr.width > 200 && rr.height > 120)
      .map((rr) => ({ x: rr.left, y: rr.top, w: rr.width, h: rr.height })),
  );

/** Biggest canvas, or null. Polled because a layout switch repaints late. */
async function mainBox(timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const all = (await boxes()).sort((a, z) => z.w * z.h - a.w * a.h);
    if (all[0]) return all[0];
    await p.waitForTimeout(400);
  }
  return null;
}

async function dragSweep(bb, count) {
  const y = bb.y + bb.h * 0.5;
  for (let i = 0; i < count; i++) {
    await p.mouse.move(bb.x + bb.w * 0.2, y);
    await p.mouse.down();
    for (let s = 1; s <= 6; s++) await p.mouse.move(bb.x + bb.w * (0.2 + 0.1 * s), y);
    await p.mouse.up();
  }
}

const waitBadge = (n, ms) =>
  p
    .waitForFunction(
      (k) => [...document.querySelectorAll("span")].filter((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())).length >= k,
      n,
      { timeout: ms, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);

const clickText = (label) =>
  p.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === t && el.getBoundingClientRect().width > 0);
    if (btn) btn.click();
    return !!btn;
  }, label);

try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const bb = await mainBox(30000);
  r.badges0 = await badges();
  await p.evaluate(() => window.__reset());

  // 1) History streams in while the pointer owns the chart: nothing may be
  //    committed mid-drag, so this window must show zero `applyBars`.
  await dragSweep(bb, 15);
  await snap("backfill-dragging", await badges());

  // 2) Pointer lifted before the fill finished: the reveal runs staged, one
  //    series per frame. `rest(N left, M lines)` proves the queue drained and
  //    the old indicator lines were dropped rather than piled up.
  r.completeReached = await waitBadge(1, 240_000);
  await p.waitForTimeout(3000);
  await snap("reveal-idle", await badges());

  // 3) The acceptance window: complete history, deep pans and hard zooms must be
  //    pure repaints while live ticks keep arriving on the `update` path.
  await dragSweep(bb, 25);
  await snap("steady-pan", await badges());
  const cx = bb.x + bb.w * 0.5;
  const cy = bb.y + bb.h * 0.5;
  for (let i = 0; i < 30; i++) {
    await p.mouse.move(cx, cy);
    await p.mouse.wheel(i % 2 ? 280 : -280);
  }
  await snap("steady-zoom", null);

  // 4) Four engines at once, hydrated from the cache rather than re-fetched.
  r.layout2x2 = await clickText("2×2");
  await p.waitForTimeout(3000);
  const all = (await boxes()).sort((a, z) => z.w * z.h - a.w * a.h);
  r.canvasCount = all.length;
  r.fourComplete = await waitBadge(4, 60_000);
  await p.evaluate(() => window.__reset());
  for (const one of all.slice(0, 4)) await dragSweep(one, 4);
  await snap("4pan-pan", await badges());
  await clickText("1");
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  r.pageErrors = errs.slice(0, 6);
  flush();
  await b.close().catch(() => {});
}
