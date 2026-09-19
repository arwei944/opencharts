import { chromium } from "playwright";

const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript(() => {
  window.__klines = 0;
  const orig = window.fetch.bind(window);
  window.fetch = (...args) => {
    const u = String(args[0]?.url ?? args[0]);
    // TanStack Start server-fn URLs carry the base64 module/export descriptor.
    const seg = u.split("?")[0].split("/").pop() ?? "";
    let meta = "";
    try {
      meta = atob(seg + "=".repeat((4 - (seg.length % 4)) % 4));
    } catch {
      meta = "";
    }
    if (meta.includes("fetchKlines")) window.__klines++;
    return orig(...args);
  };
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

const canvasBox = () =>
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

async function drag(times, dir) {
  const bb = await canvasBox();
  if (!bb) return;
  for (let i = 0; i < times; i++) {
    const startX = dir > 0 ? bb.x + bb.w * 0.3 : bb.x + bb.w * 0.7;
    await p.mouse.move(startX, bb.y + bb.h * 0.5);
    await p.mouse.down();
    for (let s = 1; s <= 4; s++) await p.mouse.move(startX + dir * s * (bb.w * 0.6), bb.y + bb.h * 0.5);
    await p.mouse.up();
    await p.waitForTimeout(90);
  }
}

const waitBadges = (n, ms) =>
  p
    .waitForFunction((k) => [...document.querySelectorAll("span")].filter((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())).length >= k, n, {
      timeout: ms,
      polling: 1000,
    })
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
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, { timeout: 30000 });
  r.filled = await waitBadges(1, 240_000);
  r.badges15m = await badges();

  // Blank reference: drag toward the future until the strip is empty.
  await drag(8, -1);
  r.inkBlankRef = await ink();
  await drag(8, 1);
  r.inkBackToData = await ink();

  r.switched1m = await clickText("1分");
  r.filled1m = await p
    .waitForFunction(
      () => !![...document.querySelectorAll("span")].find((el) => /^完整 (?!105,000)[\d,]+ 根/.test(el.textContent.trim())),
      undefined,
      { timeout: 300_000, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);
  r.badges1m = await badges();
  await p.evaluate(() => (window.__klines = 0));
  await drag(25, 1);
  await p.waitForTimeout(800);
  r.ink1mDeep = await ink();
  r.klineFetchesOn1mPan = await p.evaluate(() => window.__klines);
  r.badgesAfter1mPan = await badges();

  r.switched1s = await clickText("1秒");
  r.filled1s = await p
    .waitForFunction(() => !![...document.querySelectorAll("span")].find((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, {
      timeout: 120_000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);
  r.badges1s = await badges();

  r.layout2x2 = await clickText("2×2");
  await p.waitForTimeout(1500);
  r.filled4Panes = await waitBadges(4, 300_000);
  r.badges2x2 = await badges();
  await p.evaluate(() => (window.__klines = 0));
  await drag(20, 1);
  await p.waitForTimeout(1000);
  r.klineFetchesOn2x2Pan = await p.evaluate(() => window.__klines);
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
}
r.pageErrors = errs.slice(0, 6);
console.log(JSON.stringify(r, null, 2));
