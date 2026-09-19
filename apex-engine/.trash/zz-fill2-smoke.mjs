import { chromium } from "playwright";
const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.setDefaultTimeout(15000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const r = { ok: false };
try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].filter((el) => el.textContent.trim() === "1小时" && el.getBoundingClientRect().width > 0)[0];
    if (btn) btn.click();
  });
  await p.waitForTimeout(3000);
  const box = await p.evaluate(() => {
    let best = null, area = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const rr = c.getBoundingClientRect();
      if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) { area = rr.width * rr.height; best = { x: rr.left, y: rr.top, w: rr.width, h: rr.height }; }
    }
    return best;
  });
  r.box = !!box;
  if (box) {
    await p.mouse.move(box.x + box.w * 0.3, box.y + box.h / 2);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 220); await p.waitForTimeout(120); }
    await p.waitForTimeout(6000);
  }
  r.leftStrip = await p.evaluate(() => {
    let best = null, area = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const rr = c.getBoundingClientRect();
      if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) { area = rr.width * rr.height; best = c; }
    }
    if (!best) return null;
    const w = best.width, h = best.height;
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const ctx = off.getContext("2d");
    ctx.drawImage(best, 0, 0);
    const xEnd = Math.floor(w * 0.25);
    const img = ctx.getImageData(0, 0, xEnd, h).data;
    let inked = 0;
    for (let i = 0; i < img.length; i += 16) {
      const R = img[i], G = img[i + 1], B = img[i + 2];
      const dark = Math.abs(R - 11) < 12 && Math.abs(G - 14) < 12 && Math.abs(B - 17) < 12;
      const white = R > 244 && G > 244 && B > 244;
      if (!dark && !white) inked++;
    }
    return { sampled: Math.floor((xEnd * h) / 4), inked, ratio: +(inked / (xEnd * h / 4)).toFixed(4) };
  });
  r.backfillBadge = await p.evaluate(() => !![...document.querySelectorAll("span")].find((el) => el.textContent.trim() === "回溯中"));
  r.ok = true;
} catch (e) { r.error = String(e).split("\n")[0]; }
finally { await b.close().catch(() => {}); }
r.pageErrors = errs.slice(0, 4);
console.log(JSON.stringify(r, null, 2));
