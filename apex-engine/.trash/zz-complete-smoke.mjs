import { chromium } from "playwright";

const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript(() => {
  window.__fcount = 0;
  window.__furls = [];
  const orig = window.fetch.bind(window);
  window.fetch = (...args) => {
    const u = String(args[0]?.url ?? args[0]);
    if (!/hot-update|\.js$|\.css$/.test(u)) {
      window.__fcount++;
      if (window.__furls.length < 200) window.__furls.push(u.slice(0, 200));
    }
    return orig(...args);
  };
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));

const r = { ok: false };

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
    return { ratio: +(inked / ((xEnd * h) / 4)).toFixed(4) };
  });

const hud = () =>
  p.evaluate(() => {
    const texts = [...document.querySelectorAll("span")].map((el) => el.textContent.trim());
    return {
      complete: texts.find((t) => /^完整 [\d,]+ 根/.test(t)) ?? null,
      prefill: texts.find((t) => /^后台补齐/.test(t)) ?? null,
      backfill: texts.some((t) => t === "回溯中"),
    };
  });

const waitComplete = (ms) =>
  p
    .waitForFunction(
      () => {
        const t = [...document.querySelectorAll("span")].map((el) => el.textContent.trim());
        return !!t.find((x) => /^完整 [\d,]+ 根/.test(x));
      },
      undefined,
      { timeout: ms, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);

const box = () =>
  p.evaluate(() => {
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

const countFetches = () => p.evaluate(() => ((window.__fcount = 0), (window.__furls = [])));

const readFetches = () =>
  p.evaluate(() => {
    const urls = window.__furls ?? [];
    return {
      count: window.__fcount ?? -1,
      klineish: urls.filter((u) => /kline/i.test(u)).length,
      samples: urls.slice(0, 4),
    };
  });

async function panBack(times) {
  const bb = await box();
  if (!bb) return;
  for (let i = 0; i < times; i++) {
    await p.mouse.move(bb.x + bb.w * 0.3, bb.y + bb.h * 0.5);
    await p.mouse.down();
    for (let s = 1; s <= 4; s++) await p.mouse.move(bb.x + bb.w * 0.3 + s * (bb.w * 0.6), bb.y + bb.h * 0.5);
    await p.mouse.up();
    await p.waitForTimeout(120);
  }
}

/** The HUD's 收 figure under the crosshair — proves which slice of history is on screen. */
const hudClose = () =>
  p.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const s = spans.find((el) => el.textContent.trim().startsWith("收"));
    return s ? s.textContent.trim() : null;
  });

try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, {
    timeout: 30000,
  });
  r.hudWhileFilling = await hud();
  r.completedFirst = await waitComplete(240_000);
  r.hudAfterFill = await hud();
  r.inkBeforePan = await ink();

  await countFetches();
  const bb0 = await box();
  await p.mouse.move(bb0.x + bb0.w * 0.5, bb0.y + bb0.h * 0.5);
  r.hudAtStart = await hudClose();
  r.inkAtStart = (await ink()).ratio;
  await panBack(40);
  await p.mouse.move((await box()).x + (await box()).w * 0.5, (await box()).y + (await box()).h * 0.5);
  await p.waitForTimeout(600);
  r.hudAfterPans = await hudClose();
  r.inkAfter40Pans = await ink();
  r.fetchesWhilePanning = await readFetches();
  r.hudAfterPan = await hud();

  await panBack(60);
  await p.waitForTimeout(800);
  r.inkDeep = await ink();
  r.hudDeep = await hudClose();
  r.fetchesDeep = await readFetches();

  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === "1分钟" && el.getBoundingClientRect().width > 0);
    if (btn) btn.click();
  });
  r.completedOn1m = await waitComplete(300_000);
  r.hud1m = await hud();

  await countFetches();
  const t0 = Date.now();
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(
    () => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150),
    undefined,
    { timeout: 30000 },
  );
  r.completedAfterReload = await waitComplete(120_000);
  r.reloadMs = Date.now() - t0;
  r.fetchesOnReload = await readFetches();
  r.hudAfterReload = await hud();
  r.inkAfterReload = await ink();
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
}
r.pageErrors = errs.slice(0, 6);
console.log(JSON.stringify(r, null, 2));
