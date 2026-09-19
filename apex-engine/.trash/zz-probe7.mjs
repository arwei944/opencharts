import fs from "node:fs";
import { chromium } from "playwright";

// Reproduce the post-reveal wedge while sampling who calls `commit()`.
// Usage: node .trash/zz-probe3.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 150) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-probe7.json`;
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
  r.layout2x2 = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === "2×2" && el.getBoundingClientRect().width > 0);
    if (btn) btn.click();
    return !!btn;
  });
  await p.waitForTimeout(4000);
  for (let i = 0; i < 12; i++) {
    const four = await race(
      p.evaluate(() =>
        [...document.querySelectorAll("canvas")]
          .map((c) => c.getBoundingClientRect())
          .filter((rr) => rr.width > 200 && rr.height > 120)
          .map((rr) => ({ x: rr.left, y: rr.top, w: rr.width, h: rr.height })),
      ),
      8000,
      [],
    );
    r.fourCanvases = four.length;
    for (const one of four.slice(0, 4)) await drag(one, 2);
    const s = await peek("4pan-during-fill-" + i);
    if (!s.alive) {
      r.wedgedAt = i;
      break;
    }
  }
  r.badgesEnd = (await peek("4pan-end")).badges;
  r.ok = true;
} catch (e) {
  r.error = String(e).split(String.fromCharCode(10)).slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  flush();
  await b.close().catch(() => {});
}
