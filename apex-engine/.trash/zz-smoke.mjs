import fs from "node:fs";
import { chromium } from "playwright";

// Post-instrumentation smoke: does the removal-free build still pan, reveal and
// stay alive? Usage: node .trash/zz-smoke.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 180) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-smoke.json`;
const r = { ok: false, samples: [], startedAt: new Date().toISOString() };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const flush = () => {
  fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
  log("flushed", OUT);
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

const peek = () =>
  race(
    p.evaluate(() => {
      const c = [...document.querySelectorAll("canvas")].sort((a, x) => x.width * x.height - a.width * a.height)[0];
      const grab = () => {
        const t = document.createElement("canvas");
        t.width = 220;
        t.height = 160;
        const g = t.getContext("2d");
        g.drawImage(c, 0, 0, 220, 160);
        return g.getImageData(0, 0, 220, 160).data;
      };
      const a = grab();
      let ink = 0;
      // The chart canvas is opaque everywhere, so "non-transparent pixels" is
      // useless — sum the colour instead, that moves when the bars move.
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] > 40) ink++;
        sum = (sum + i * 7 + a[i] + a[i + 1] * 3 + a[i + 2] * 5) % 2147483647;
      }
      return {
        alive: true,
        atMs: Math.round(performance.now() - window.__t0),
        doc: window.__doc,
        fps: +(window.__f.frames / ((performance.now() - window.__t0) / 1000)).toFixed(1),
        maxGap: +window.__f.maxGap.toFixed(0),
        long: window.__long.length,
        worstLong: Math.max(0, ...window.__long),
        ink,
        sum,
        canvases: document.querySelectorAll("canvas").length,
        badge: [...document.querySelectorAll("span")]
          .map((el) => el.textContent.trim())
          .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t))
          .slice(0, 1)[0],
      };
    }),
    12000,
    { alive: false },
  );

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(
    p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300), undefined, { timeout: 40000 }),
    45000,
  );
  r.mounted = await peek();
  // Pan while the background fill is still running: the core ask is that this
  // never blanks or wedges, whatever the fill has reached so far.
  await race(p.waitForTimeout(30000), 35000);
  r.fillDrag = await race(drag(4), 30000, "stalled").then(() => peek());
  // The complete badge reads `完整 105,000 根 · 始于 ...`, so match the prefix only.
  const BADGE = () => [...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t));
  await race(p.waitForFunction(BADGE, undefined, { timeout: 170000 }).catch(() => null), 175000);
  r.complete = await peek();
  flush();

  const runs = [];
  for (let k = 0; k < 3; k++) {
    const before = await peek();
    await drag(8);
    const after = await peek();
    runs.push({ before, after, inkMoved: !!(before?.sum && after?.sum && before.sum !== after.sum) });
    r.samples.push({ k, ...after });
    flush();
  }
  r.runs = runs.map((x) => x.inkMoved);
  await p.waitForTimeout(15000);
  r.idle = await peek();
  r.ok =
    !!r.fillDrag?.alive &&
    r.runs.every(Boolean) &&
    !!r.idle.alive &&
    /完整/.test(String(r.complete?.badge));
} catch (e) {
  r.error = String(e).split("\n").slice(0, 4).join(" | ");
}
clearTimeout(watchdog);
flush();
await b.close();
process.exit(0);
