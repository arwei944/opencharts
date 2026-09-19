import { chromium } from "playwright";
const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.setDefaultTimeout(20000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const r = { ok: false };
try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
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
    const cx = box.x + box.w * 0.35, cy = box.y + box.h / 2;
    await p.mouse.move(cx, cy);
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(120); }
    await p.waitForTimeout(6000); // allow the auto-fill chain to run
    await p.screenshot({ path: "zz-zoom2.png", timeout: 30000 });
  }
  r.ok = true;
} catch (e) { r.error = String(e).split("\n")[0]; }
finally { await b.close().catch(() => {}); }
r.pageErrors = errs.slice(0, 4);
console.log(JSON.stringify(r, null, 2));
