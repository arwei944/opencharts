import fs from "node:fs";
import { chromium } from "playwright";

// Counts full-history commits per window, and aborts the moment the renderer
// stops answering instead of hanging forever.
// Usage: node .trash/zz-probe2.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 240) * 1000;
const OUT = ".trash/probe2.json";
const r = { ok: false, windows: [], commits: 0, startedAt: new Date().toISOString() };
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
  window.__commits = 0;
  window.__t0 = performance.now();
  window.__reset = () => {
    window.__perf = [];
    window.__f = { frames: 0, maxGap: 0, longTasks: 0, maxTask: 0, last: performance.now() };
  };
  window.__reset();
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
    const f = window.__f;
    for (const e of l.getEntries()) {
      f.longTasks++;
      if (e.duration > f.maxTask) f.maxTask = e.duration;
    }
  }).observe({ entryTypes: ["longtask"] });
});

const p = await ctx.newPage();
p.setDefaultTimeout(15000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

/** Resolve false once the renderer stops answering — the wedge signature. */
const alive = async () => {
  const t = p.evaluate(() => 1).catch(() => 0);
  return Promise.race([t, new Promise((res) => setTimeout(() => res(0), 6000))]).then((v) => v === 1);
};

const snap = async (what) => {
  const v = await p
    .evaluate((w) => {
      const f = window.__f;
      const agg = {};
      for (const [label, ms] of window.__perf) {
        const key = label.startsWith("rest(") ? "rest" : label.split(":")[0];
        const a = (agg[key] ??= { n: 0, ms: 0 });
        a.n++;
        a.ms += ms;
      }
      const out = {
        what: w,
        atMs: Math.round(performance.now() - window.__t0),
        frames: f.frames,
        maxGap: +f.maxGap.toFixed(0),
        longTasks: f.longTasks,
        maxTask: +f.maxTask.toFixed(0),
        commits: agg["applyBars"]?.n ?? 0,
        commitMs: agg["applyBars"]?.ms ?? 0,
        restJobs: agg.rest?.n ?? 0,
        restMs: agg.rest?.ms ?? 0,
        badges: [...document.querySelectorAll("span")]
          .map((el) => el.textContent.trim())
          .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t))
          .slice(0, 2),
      };
      window.__reset();
      return out;
    }, what)
    .catch((e) => ({ what, evaluateFailed: String(e).slice(0, 100) }));
  r.windows.push(v);
  flush();
  return v;
};

const bb = { x: 208, y: 124, w: 882, h: 488 };
async function drag(group) {
  const y = bb.y + bb.h * 0.5;
  for (let i = 0; i < group; i++) {
    await p.mouse.move(bb.x + bb.w * 0.25, y);
    await p.mouse.down();
    for (let s = 1; s <= 4; s++) await p.mouse.move(bb.x + bb.w * (0.25 + 0.12 * s), y);
    await p.mouse.up();
  }
}

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, {
    timeout: 40000,
  });
  await p.evaluate(() => window.__reset());

  // Drag in small groups while the fill runs, checking liveness and commit count
  // after every group. The fill window is only seconds, so groups of 3.
  for (let g = 0; g < 8; g++) {
    if (!(await alive())) {
      r.wedgedAt = `group-${g}`;
      break;
    }
    await drag(3);
    const w = await snap(`prefill-group-${g}`);
    if (w.badges?.[0]?.startsWith("完整")) {
      r.completeAtGroup = g;
      break;
    }
  }
  await p.waitForTimeout(2000);
  await snap("idle-after-bursts");
  // Then the same sweep once the history is resident.
  const done = await p
    .waitForFunction(() => [...document.querySelectorAll("span")].some((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, {
      timeout: 120_000,
      polling: 1000,
    })
    .then(() => true)
    .catch(() => false);
  r.completeReached = done;
  await p.evaluate(() => window.__reset());
  await drag(10);
  await snap("steady-10-drags");
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  r.pageErrors = errs.slice(0, 5);
  flush();
  await b.close().catch(() => {});
}
