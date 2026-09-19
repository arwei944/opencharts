import fs from "node:fs";
import { chromium } from "playwright";

// Mobile (<lg) branch: every tab must actually have height, and the chart must
// boot exactly one engine per visible pane. Also re-checks the desktop branch.
const OUT = `${process.env.TEMP.replace(/\\/g, "/")}/apex-mobile.json`;
const r = { ok: false, runs: [] };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const probe = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => {
    r.pageErrors = [...(r.pageErrors ?? []), String(e).split("\n").slice(0, 3).join(" | ")].slice(0, 5);
  });
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.getBoundingClientRect().height > 100), null, {
    timeout: 40000,
  });
  const tabs = ["图表", "盘口", "交易"];
  const per = [];
  for (const t of tabs) {
    await p.evaluate((n) => {
      const btn = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === n);
      btn?.click();
    }, t);
    await p.waitForTimeout(700);
    per.push(
      await p.evaluate((tab) => {
        const box = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const bb = e.getBoundingClientRect();
          return { w: Math.round(bb.width), h: Math.round(bb.height) };
        };
        const cs = [...document.querySelectorAll("canvas")].map((c) => {
          const bb = c.getBoundingClientRect();
          return { w: Math.round(bb.width), h: Math.round(bb.height) };
        });
        return {
          tab,
          host: box("div.absolute.inset-0"),
          chartLib: box("div.tv-lightweight-charts"),
          book: box("div.flex.h-full.flex-col"),
          biggestCanvas: cs.sort((a, x) => x.w * x.h - a.w * a.h)[0] ?? null,
          canvases: cs.length,
          badge: [...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((x) => /^(完整 [\d,]+ 根|后台补齐)/.test(x)),
        };
      }, t),
    );
  }
  const shot = `${process.env.TEMP.replace(/\\/g, "/")}/apex-${w}x${h}.png`;
  await p.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "图表")?.click();
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: shot });
  await ctx.close();
  return { viewport: [w, h], per, shot };
};

for (const [w, h] of [
  [390, 720],
  [594, 553],
  [820, 900],
  [1440, 860],
]) {
  r.runs.push(await probe(w, h));
  flush();
}
const mobile = r.runs.filter((x) => x.viewport[0] < 1024);
r.ok =
  !r.pageErrors?.length &&
  mobile.every((x) => {
    const chart = x.per.find((p) => p.tab === "图表");
    const book = x.per.find((p) => p.tab === "盘口");
    return (chart.host?.h ?? 0) > 150 && (chart.biggestCanvas?.h ?? 0) > 100 && (book.book?.h ?? 0) > 150;
  });
flush();
await b.close();
process.exit(0);
