import { chromium } from "playwright";

const URL = "http://127.0.0.1:8080/";
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
p.setDefaultTimeout(30000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const r = { ok: false };

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
      if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) {
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
      const white = R > 244 && G > 244 && B > 244;
      if (!dark && !white) inked++;
    }
    return +(inked / ((xEnd * h) / 4)).toFixed(4);
  });

const canvasBox = async () => {
  for (let i = 0; i < 40; i++) {
    const bb = await p.evaluate(() => {
      let best = null;
      let area = 0;
      for (const c of document.querySelectorAll("canvas")) {
        const rr = c.getBoundingClientRect();
        if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) {
          area = rr.width * rr.height;
          best = { x: rr.left, y: rr.top, w: rr.width, h: rr.height };
        }
      }
      return best;
    });
    if (bb) return bb;
    await p.waitForTimeout(500);
  }
  return null;
};

const snap = (what) =>
  p
    .evaluate((w) => {
      const f = window.__f;
      const out = {
        what: w,
        atMs: Math.round(performance.now() - window.__t0),
        frames: f.frames,
        maxGap: +f.maxGap.toFixed(1),
        over50: f.over50,
        over100: f.over100,
        longTasks: f.longTasks,
        maxTask: +f.maxTask.toFixed(1),
        klines: window.__klines,
        wsSockets: window.__wsSockets,
        wsTicks: window.__wsTicks,
        perf: window.__perf.filter((e) => e[0].startsWith("applyBars") || e[0].startsWith("rest(")).slice(-24),
        cacheWrites: window.__perf.filter((e) => e[0].startsWith("idbPut")).slice(-3),
      };
      window.__reset();
      window.__klines = 0;
      return out;
    }, what)
    .then((v) => v);

/** Continuous drag sequence: press, sweep rightwards into history, release. Gaps
 *  between cycles stay well under the 350ms interaction timeout. */
async function dragSweep(bb, count) {
  const y = bb.y + bb.h * 0.5;
  for (let i = 0; i < count; i++) {
    await p.mouse.move(bb.x + bb.w * 0.2, y);
    await p.mouse.down();
    for (let s = 1; s <= 8; s++) await p.mouse.move(bb.x + bb.w * (0.2 + 0.08 * s), y);
    await p.mouse.up();
  }
}

const waitComplete = (ms) =>
  p
    .waitForFunction(() => !![...document.querySelectorAll("span")].find((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, {
      timeout: ms,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);

try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, { timeout: 30000 });
  await p.waitForTimeout(1000);
  const bb = await canvasBox();
  await p.evaluate(() => window.__reset());

  // 1) Drag repeatedly into history while the background fill is still running,
  //    releasing in between. Every burst must show: no `setData` while the
  //    pointer owns the chart, one staged reveal after it lifts, and no series
  //    piling up across reveals (`lines` stays at the indicator count).
  r.badgesWhileFilling = await badges();
  r.reveals = [];
  for (let round = 0; round < 4; round++) {
    await dragSweep(bb, 18);
    const during = await snap(`burst-${round}-during`);
    during.ink = await ink();
    await p.waitForTimeout(2600);
    const after = await snap(`burst-${round}-after`);
    after.ink = await ink();
    r.reveals.push({ during, after });
  }
  r.badgesAfterReveals = await badges();

  // 3) Steady state: history complete, deep panning must be pure repaints even
  //    while live ticks keep arriving.
  r.completeReached = await waitComplete(240_000);
  await p.waitForTimeout(800);
  await p.evaluate(() => window.__reset());
  const t0 = await p.evaluate(() => window.__wsTicks);
  await dragSweep(bb, 60);
  r.steadyLongPan = await snap("steady-pan-60");
  r.steadyLongPan.wsTicksDuring = (await p.evaluate(() => window.__wsTicks)) - t0;
  r.inkSteady = await ink();
  r.badgesSteady = await badges();

  // 4) Worst case: four panes, four independent fills, dragging across them.
  const clickText = (label) =>
    p.evaluate((t) => {
      const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === t && el.getBoundingClientRect().width > 0);
      if (btn) btn.click();
      return !!btn;
    }, label);
  r.layout2x2 = await clickText("2×2");
  await p.waitForTimeout(1500);
  const bb4 = await canvasBox();
  await p.evaluate(() => window.__reset());
  await dragSweep(bb4, 25);
  r.panWhile4PanesFill = await snap("4pan-fill-drag");
  r.fourComplete = await p
    .waitForFunction(
      () => [...document.querySelectorAll("span")].filter((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())).length >= 4,
      undefined,
      { timeout: 420_000, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__reset());
  await dragSweep(bb4, 25);
  r.panAfter4PanesComplete = await snap("4pan-steady");
  r.ink4 = await ink();
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
}
r.pageErrors = errs.slice(0, 6);
console.log(JSON.stringify(r, null, 2));
