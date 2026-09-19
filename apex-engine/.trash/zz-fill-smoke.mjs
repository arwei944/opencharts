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
  // switch to 1h like the user did
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")]
      .filter((el) => el.textContent.trim() === "1小时" && el.getBoundingClientRect().width > 0)[0];
    if (btn) btn.click();
  });
  await p.waitForTimeout(3000); // let the 1h initial load land
  const box = await p.evaluate(() => {
    let best = null, area = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const rr = c.getBoundingClientRect();
      if (rr.width > 300 && rr.height > 150 && rr.width * rr.height > area) { area = rr.width * rr.height; best = { x: rr.left, y: rr.top, w: rr.width, h: rr.height }; }
    }
    return best;
  });
  if (box) {
    await p.mouse.move(box.x + box.w * 0.3, box.y + box.h / 2);
    for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(120); }
    await p.waitForTimeout(6000); // auto-fill chain
    await p.screenshot({ path: "zz-fill.png", timeout: 30000 });
  }
  r.ok = true;
} catch (e) { r.error = String(e).split("\n")[0]; }
finally { await b.close().catch(() => {}); }
r.pageErrors = errs.slice(0, 4);
console.log(JSON.stringify(r, null, 2));
