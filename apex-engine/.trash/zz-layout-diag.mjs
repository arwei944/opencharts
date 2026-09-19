import fs from "node:fs";
import { chromium } from "playwright";

const race = (pr, ms, tag) => Promise.race([pr, new Promise((res) => setTimeout(() => res(tag), ms))]);
const out = { steps: [] };
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") out.logs = [...(out.logs ?? []), `${m.type()}: ${m.text()}`.slice(0, 300)].slice(-14);
});
p.on("pageerror", (e) => {
  out.errs = [...(out.errs ?? []), String(e).split("\n").slice(0, 4).join(" | ")].slice(0, 6);
});

const dump = (what) =>
  race(
    p.evaluate((w) => {
      const grids = [...document.querySelectorAll("div.grid")].filter((el) => /grid-cols-\d/.test(el.className) && /grid-rows-\d/.test(el.className));
      return {
        what: w,
        canvases: document.querySelectorAll("canvas").length,
        sizedCanvases: [...document.querySelectorAll("canvas")]
          .map((c) => c.getBoundingClientRect())
          .filter((r) => r.width > 100)
          .length,
        grids: grids.map((el) => {
          const rr = el.getBoundingClientRect();
          return `${el.className.match(/grid-cols-\d/)[0]}x${el.className.match(/grid-rows-\d/)[0]} children=${el.children.length} ${Math.round(rr.width)}x${Math.round(rr.height)}`;
        }),
        badges: [...document.querySelectorAll("span")]
          .map((el) => el.textContent.trim())
          .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t))
          .slice(0, 6),
        layoutButtons: [...document.querySelectorAll("button")]
          .map((el) => el.textContent.trim())
          .filter((t) => /^(\d|1x2|2x1|2x2|\d[×x]\d)$/.test(t))
          .slice(0, 8),
      };
    }, what),
    8000,
    { what, evaluate: "dead" },
  );

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(p.waitForFunction(() => document.querySelectorAll("canvas").length > 0, undefined, { timeout: 30000 }), 35000);
  out.steps.push(await dump("1x1"));
  for (const label of ["2×2", "1×2", "2×1", "2×2"]) {
    const clicked = await race(
      p.evaluate((t) => {
        const btn = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === t && el.getBoundingClientRect().width > 0);
        if (btn) btn.click();
        return !!btn;
      }, label),
      8000,
      false,
    );
    await p.waitForTimeout(2500);
    const s = await dump(`after:${label}`);
    s.clicked = clicked;
    out.steps.push(s);
  }
} catch (e) {
  out.fatal = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
  fs.writeFileSync(`${process.env.TEMP}/apex-layout.json`, JSON.stringify(out, null, 2));
}
