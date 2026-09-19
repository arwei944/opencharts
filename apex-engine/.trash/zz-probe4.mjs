import fs from "node:fs";
import { chromium } from "playwright";

// Dump the raw staged-commit labels so `rest(N left, M lines)` shows whether the
// indicator series pile up across reveals, and watch fps decay after the reveal.
const BUDGET_MS = Number(process.argv[2] ?? 120) * 1000;
const OUT = ".trash/probe4.json";
const r = { startedAt: new Date().toISOString(), samples: [] };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript(() => {
  window.__perf = [];
  window.__t0 = performance.now();
  window.__f = { frames: 0, maxGap: 0, last: performance.now() };
  const step = (t) => {
    const f = window.__f;
    const dt = t - f.last;
    f.last = t;
    f.frames++;
    if (dt > f.maxGap) f.maxGap = dt;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.push(["longtask", Math.round(e.duration)]);
  }).observe({ entryTypes: ["longtask"] });
});

const p = await ctx.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => {
  r.pageErrors = [...(r.pageErrors ?? []), String(e).slice(0, 200)];
  flush();
});
const bb = { x: 208, y: 124, w: 882, h: 488 };
const peek = (what) =>
  Promise.race([
    p.evaluate((w) => {
      const labels = window.__perf.map((e) => (e[0] === "longtask" ? "long" : e[0]));
      const agg = {};
      for (const l of labels) agg[l] = (agg[l] ?? 0) + 1;
      return {
        what: w,
        alive: true,
        atMs: Math.round(performance.now() - window.__t0),
        frames: window.__f.frames,
        maxGap: Math.round(window.__f.maxGap),
        longSum: window.__perf.filter((e) => e[0] === "longtask").reduce((a, e) => a + e[1], 0),
        agg,
        tail: window.__perf.slice(-26).map((e) => `${e[0]}=${e[1]}`),
        badges: [...document.querySelectorAll("span")]
          .map((el) => el.textContent.trim())
          .filter((t) => /^完整 [\d,]+ 根/.test(t))
          .slice(0, 1),
      };
    }, what),
    new Promise((res) => setTimeout(() => res({ what, alive: false }), 7000)),
  ]).catch(() => ({ what, alive: false }));

const race = (pr, ms) => Promise.race([pr, new Promise((res) => setTimeout(() => res("stalled"), ms))]);
async function drag(n) {
  const y = bb.y + bb.h * 0.5;
  return race(
    (async () => {
      for (let i = 0; i < n; i++) {
        await p.mouse.move(bb.x + bb.w * 0.25, y);
        await p.mouse.down();
        for (let s = 1; s <= 4; s++) await p.mouse.move(bb.x + bb.w * (0.25 + 0.12 * s), y);
        await p.mouse.up();
      }
    })(),
    9000,
  );
}

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300), undefined, { timeout: 40000 }), 45000);
  await race(p.waitForFunction(() => [...document.querySelectorAll("span")].some((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, { timeout: 90000, polling: 1000 }), 100000);
  r.samples.push(await peek("just-complete"));
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(1500);
    const s = await peek(`idle-${i}`);
    r.samples.push(s);
    flush();
    if (!s.alive) {
      r.diedAtIdle = i;
      break;
    }
  }
  // Same again, but dragging, to see if the drag itself resurrects the decay.
  for (let i = 0; i < 4; i++) {
    await drag(2);
    const s = await peek(`drag-${i}`);
    r.samples.push(s);
    flush();
    if (!s.alive) {
      r.diedAtDrag = i;
      break;
    }
  }
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  flush();
  await b.close().catch(() => {});
}
