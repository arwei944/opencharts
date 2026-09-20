import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(20000);

const probe = await page.evaluate(() => {
  const st = window.useTerminal.getState();
  const canvases = document.querySelectorAll("canvas");
  const c = canvases[0];
  let drawn = false;
  if (c) {
    try {
      const img = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let nonEmpty = 0;
      for (let i = 3; i < img.length; i += 4) if (img[i] !== 0) nonEmpty++;
      drawn = nonEmpty > 500;
    } catch {}
  }
  const body = document.body.innerText;
  return {
    bars: st.bars.length,
    phase: st.historyStatus["spot:BTCUSDT:15m"]?.phase,
    live: st.live,
    canvases: canvases.length,
    drawn,
    hasOrderBook: /买盘|卖盘|数量/.test(body),
    hasTicker: /24h高/.test(body),
  };
});

console.log(JSON.stringify(probe, null, 2));
console.log("=== page errors ===");
errors.slice(0, 10).forEach((e) => console.log(e));
await browser.close();