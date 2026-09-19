import { chromium } from "playwright";
const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultTimeout(9000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const r = { ok: false };
try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await p.waitForFunction(() => !!document.querySelector('button[aria-label*="模式"]'), { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);
  r.dataThemeInitial = await p.evaluate(() => document.documentElement.dataset.theme || null);
  r.bodyBgDark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.screenshot({ path: "zz-dark.png" });
  await p.click('button[aria-label*="模式"]').catch((e) => (r.clickErr = String(e).slice(0, 100)));
  await p.waitForTimeout(700);
  r.dataThemeAfter = await p.evaluate(() => document.documentElement.dataset.theme || null);
  r.bodyBgLight = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.screenshot({ path: "zz-light.png" });
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n")[0];
} finally {
  await b.close().catch(() => {});
}
r.pageErrors = errs.slice(0, 4);
console.log(JSON.stringify(r, null, 2));
