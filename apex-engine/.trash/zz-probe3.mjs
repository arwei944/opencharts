import fs from "node:fs";
import { chromium } from "playwright";

// Reproduce the post-reveal wedge while sampling who calls `commit()`.
// Usage: node .trash/zz-probe3.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 150) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-probe3.json`;
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

const bb = { x: 208, y: 124, w: 882, h: 488 };
async function drag(n) {
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
  return Promise.race([ops, new Promise((res) => setTimeout(() => res("drag-stalled"), 9000))]);
}

const peek = () =>
  Promise.race([
    p.evaluate(() => ({
      alive: true,
      atMs: Math.round(performance.now() - window.__t0),
      doc: window.__doc,
      frames: window.__f.frames,
      maxGap: +window.__f.maxGap.toFixed(0),
      commits: window.__stacks.length,
      detail: window.__stacks.slice(-6).map((x) => x[0] + " " + x[2]),
      ec: globalThis.__ec ?? 0,
      canvases: document.querySelectorAll("canvas").length,
      lastCommitBars: window.__stacks.at(-1)?.[0] ?? 0,
      stacks: [...new Set(window.__stacks.map((s) => s[2]))].slice(0, 6),
      badges: [...document.querySelectorAll("span")]
        .map((el) => el.textContent.trim())
        .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t))
        .slice(0, 1),
    })),
    new Promise((res) => setTimeout(() => res({ alive: false }), 6000)),
  ]).catch(() => ({ alive: false }));

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, {
    timeout: 40000,
  });
  for (let i = 0; i < 22; i++) {
    const alive = await peek();
    r.samples.push({ i, ...alive });
    flush();
    if (!alive.alive) {
      r.wedgedAtSample = i;
      break;
    }
    const d = await drag(2);
    if (d === "drag-stalled") r.dragStalledAtSample = i;
    await p.waitForTimeout(900);
  }
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  flush();
  await b.close().catch(() => {});
}
