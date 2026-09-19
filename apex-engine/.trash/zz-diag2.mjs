import fs from "node:fs";
import { chromium } from "playwright";

const out = { logs: [], errs: [], canvases: null, body: null };
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
  const p = await ctx.newPage();
  p.on("console", (m) => out.logs.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  p.on("pageerror", (e) => out.errs.push(String(e).split("\n").slice(0, 4).join(" | ")));
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await p.waitForTimeout(12000);
  out.canvases = await p
    .evaluate(() =>
      [...document.querySelectorAll("canvas")]
        .map((c) => {
          const rr = c.getBoundingClientRect();
          return `${Math.round(rr.width)}x${Math.round(rr.height)}@${Math.round(rr.left)},${Math.round(rr.top)}`;
        })
        .slice(0, 16),
    )
    .catch((e) => "evaluate hung: " + String(e).slice(0, 80));
  out.badges = await p
    .evaluate(() =>
      [...document.querySelectorAll("span")]
        .map((el) => el.textContent.trim())
        .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t)),
    )
    .catch(() => "evaluate hung");
  out.spans = await p
    .evaluate(() => document.querySelectorAll("span").length)
    .catch(() => "evaluate hung");
} catch (e) {
  out.fatal = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
  out.logs = out.logs.slice(-25);
  out.errs = out.errs.slice(0, 8);
  fs.writeFileSync(".trash/diag2.json", JSON.stringify(out, null, 2));
}
