import { chromium } from "playwright";

const URL = "http://127.0.0.1:8080/";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });

await ctx.addInitScript(() => {
  window.__sockets = [];
  const WS = window.WebSocket;
  class Probe extends WS {
    constructor(url, protocols) {
      super(url, protocols);
      const rec = { url: String(url).slice(0, 90), open: 0, msg: 0, err: 0, close: 0 };
      window.__sockets.push(rec);
      for (const t of ["open", "message", "error", "close"]) {
        super.addEventListener(t, () => {
          rec[t === "message" ? "msg" : t]++;
        });
      }
      let handler = null;
      Object.defineProperty(this, "onmessage", {
        configurable: true,
        get: () => handler,
        set: (fn) => {
          rec.assigned = true;
          handler = (ev) => {
            rec.msg++;
            fn(ev);
          };
        },
      });
    }
  }
  window.WebSocket = Probe;
  window.__engines = 0;
});

const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const r = {};

try {
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 150), undefined, { timeout: 30000 });
  await p.waitForFunction(() => !![...document.querySelectorAll("span")].find((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, {
    timeout: 300000,
    polling: 1000,
  });
  await p.waitForTimeout(6000);
  r.badges = await p.evaluate(() =>
    [...document.querySelectorAll("span")]
      .map((el) => el.textContent.trim())
      .filter((t) => /^(完整 [\d,]+ 根|后台补齐)/.test(t)),
  );
  r.canvases = await p.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((c) => {
      const rr = c.getBoundingClientRect();
      return `${Math.round(rr.width)}x${Math.round(rr.height)}@${Math.round(rr.left)},${Math.round(rr.top)}`;
    }),
  );
  r.gridChildren = await p.evaluate(() => {
    const g = [...document.querySelectorAll("div")].find((el) => el.className.includes("grid-cols"));
    return g ? `${g.className} -> ${g.children.length}` : null;
  });
  r.sockets = await p.evaluate(() => window.__sockets);
  r.priceSamples = await p.evaluate(async () => {
    const text = () => document.body.innerText.replace(/\s+/g, " ").slice(0, 400);
    const a = text();
    await new Promise((res) => setTimeout(res, 4000));
    return { changed: a !== text(), a: a.slice(0, 120), b: text().slice(0, 120) };
  });
  r.ok = true;
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  await b.close().catch(() => {});
}
r.pageErrors = errs.slice(0, 6);
console.log(JSON.stringify(r, null, 2));
