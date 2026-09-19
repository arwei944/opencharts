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
    await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(80); }
    await p.waitForTimeout(1500);
  }
  r.intervalBtn = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .map((el) => ({ t: el.textContent.trim(), rect: el.getBoundingClientRect() }))
      .filter((x) => /^(1秒|1分|15分|1小时|12小时|1月)$/.test(x.t) && x.rect.width > 0);
    const el = btns.find((x) => x.t === "1小时") || btns[0];
    return el ? { text: el.t, width: Math.round(el.rect.width), height: Math.round(el.rect.height) } : null;
  });
  await p.screenshot({ path: "zz-zoom.png", timeout: 30000 });
  r.ok = true;
} catch (e) { r.error = String(e).split("\n")[0]; }
finally { await b.close().catch(() => {}); }
r.pageErrors = errs.slice(0, 4);
console.log(JSON.stringify(r, null, 2));
