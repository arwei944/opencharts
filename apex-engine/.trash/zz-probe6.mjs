import fs from "node:fs";
import { chromium } from "playwright";

// Reproduce the post-reveal wedge while sampling who calls `commit()`.
// Usage: node .trash/zz-probe3.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 150) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-probe6.json`;
const r = { ok: false, samples: [], startedAt: new Date().toISOString() };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__stacks = [];
  window.__perf = [];
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
});

const p = await ctx.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => {
  r.pageErrors = [...(r.pageErrors ?? []), String(e).split("\n").slice(0, 3).join(" | ")].slice(0, 5);
  flush();
});

const race = (pr, ms, tag) => Promise.race([pr, new Promise((res) => setTimeout(() => res(tag), ms))]);
const BB = { x: 208, y: 124, w: 882, h: 488 };
async function drag(box, n) {
  const bb = box && box.w > 100 ? box : BB;
  const y = bb.y + bb.h * 0.5;
  const ops = (async () => {
    for (let i = 0; i < n; i++) {
      await p.mouse.move(bb.x + bb.w * 0.25, y);
      await p.mouse.down();
      for (let s = 1; s <= 4; s++) await p.mouse.move(bb.x + bb.w * (0.25 + 0.12 * s), y);
      await p.mouse.up();
    }
  })();
  // A wedged renderer never ACKs input: never let the sweep outlive the check.
  return race(ops, 20000, "drag-stalled");
}

async function peek(what) {
  const v = await race(
    p.evaluate(() => ({
      alive: true,
      atMs: Math.round(performance.now() - window.__t0),
      doc: window.__doc,
      frames: window.__f.frames,
      maxGap: +window.__f.maxGap.toFixed(0),
      commits: window.__stacks.length,
      detail: window.__stacks.slice(-4).map((x) => x[0] + " " + x[2]),
      ec: globalThis.__ec ?? 0,
      canvases: document.querySelectorAll("canvas").length,
      badges: [...document.querySelectorAll("span")]
        .map((el) => el.textContent.trim())
        .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t))
        .slice(0, 4),
    })),
    9000,
    { alive: false },
  );
  v.what = what;
  r.samples.push(v);
  flush();
  return v;
}

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300), undefined, { timeout: 40000 }), 45000);
  r.completeReached = await race(
    p.waitForFunction(() => [...document.querySelectorAll("span")].some((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, { timeout: 150000, polling: 1000 }),
    160000,
    "no-complete",
  ).then((v) => (v === "no-complete" ? false : true));
  await p.waitForTimeout(4000);
  const bb = (await race(p.evaluate(() => {
    let best = null, area = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const rr = c.getBoundingClientRect();
      if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) { area = rr.width * rr.height; best = { x: rr.left, y: rr.top, w: rr.width, h: rr.height }; }
    }
    return best;
  }), 8000, null)) ?? { x: 208, y: 124, w: 882, h: 488 };

  await peek("before-pan");
  await drag(bb, 10);
  await peek("steady-10-drags");
  // Hard zoom in and out on the same spot.
  await p.evaluate(() => { window.__stacks.length = 0; window.__f.frames = 0; window.__f.maxGap = 0; });
  const cx = bb.x + bb.w * 0.5, cy = bb.y + bb.h * 0.5;
  await race((async () => { for (let i = 0; i < 24; i++) { await p.mouse.move(cx, cy); await p.mouse.wheel(0, i % 2 ? 300 : -300); } })(), 30000, "zoom-stalled");
  await peek("steady-24-zooms");

  // Worst case: four engines. They hydrate from the cache, so no new fetch storm.
  r.layout2x2 = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === "2×2" && el.getBoundingClientRect().width > 0);
    if (btn) btn.click();
    return !!btn;
  });
  r.fourComplete = await race(
    p.waitForFunction(() => [...document.querySelectorAll("span")].filter((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())).length >= 4, undefined, { timeout: 120000, polling: 1000 }),
    130000,
    "no-4-complete",
  ).then((v) => (v === "no-4-complete" ? false : true));
  await p.waitForTimeout(4000);
  await p.evaluate(() => { window.__stacks.length = 0; window.__f.frames = 0; window.__f.maxGap = 0; });
  const four = await race(p.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect()).filter((rr) => rr.width > 200 && rr.height > 120).map((rr) => ({ x: rr.left, y: rr.top, w: rr.width, h: rr.height }))), 8000, []);
  r.fourCanvases = four.length;
  for (const one of four.slice(0, 4)) await drag(one, 4);
  await peek("4pan-pan");
  r.ok = true;
} catch (e) {
  r.error = String(e).split(String.fromCharCode(10)).slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  flush();
  await b.close().catch(() => {});
}
