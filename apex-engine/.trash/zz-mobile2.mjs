import fs from "node:fs";
import { chromium } from "playwright";

// Focused re-check of the <lg tabs: pick only elements that actually have a box,
// so the hidden desktop branch cannot be mistaken for the mobile one.
const dir = process.env.TEMP.replace(/\\/g, "/");
const OUT = `${dir}/apex-mobile2.json`;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const r = { ok: false, runs: [] };

for (const [w, h] of [
  [390, 720],
  [594, 553],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "盘口"), null, { timeout: 30000 });
  const per = [];
  for (const tab of ["图表", "盘口", "交易"]) {
    await p.evaluate((n) => {
      [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === n)?.click();
    }, tab);
    await p.waitForTimeout(900);
    per.push(
      await p.evaluate((n) => {
        const live = (sel) =>
          [...document.querySelectorAll(sel)]
            .map((e) => e.getBoundingClientRect())
            .filter((bb) => bb.height > 1 && bb.width > 1)
            .map((bb) => ({ w: Math.round(bb.width), h: Math.round(bb.height) }));
        const rows = [...document.querySelectorAll("div.grid.grid-cols-3 > div, div.grid-cols-3 > div")]
          .map((e) => e.getBoundingClientRect())
          .filter((bb) => bb.height > 1).length;
        return {
          tab: n,
          chartHost: live("div.absolute.inset-0"),
          orderBook: live("div.flex.h-full.flex-col"),
          tapeRows: live("div.min-h-0.flex-1.overflow-auto.font-mono > div"),
          canvases: live("canvas").length,
        };
      }, tab),
    );
  }
  await p.screenshot({ path: `${dir}/apex-m2-${w}x${h}.png` });
  await ctx.close();
  r.runs.push({ viewport: [w, h], per });
  fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
}
r.ok = r.runs.every((x) => {
  const c = x.per[0].chartHost[0];
  const bk = x.per[1].orderBook[0];
  return c && c.h > 150 && bk && bk.h > 150;
});
fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
await b.close();
process.exit(0);
