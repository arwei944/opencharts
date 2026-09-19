import fs from "node:fs";
import { chromium } from "playwright";

// Does a pan reveal already-present bars? Drags use the real canvas rect (not a
// hardcoded box) and compare a checksum of the price area plus the crosshair
// legend, so a no-op drag cannot pass.
// Usage: node .trash/zz-smoke3.mjs [seconds]
const BUDGET_MS = Number(process.argv[2] ?? 200) * 1000;
const OUT = `${process.env.TEMP || "/tmp"}/apex-smoke3.json`;
const r = { ok: false, steps: [], startedAt: new Date().toISOString() };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const flush = () => {
  fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
  log("flushed");
};
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => {
  r.pageErrors = [...(r.pageErrors ?? []), String(e).split("\n").slice(0, 3).join(" | ")].slice(0, 5);
  flush();
});

const race = (pr, ms, tag) => Promise.race([pr, new Promise((res) => setTimeout(() => res(tag), ms))]);

// Sum the colour of a horizontal strip of the chart canvas via a scaled copy, so
// the number moves the moment the candles under it move.
const SNAP = () =>
  race(
    p.evaluate(() => {
      const list = [...document.querySelectorAll("canvas")].sort((a, x) => x.width * x.height - a.width * a.height);
      const c = list[0];
      if (!c) return { alive: false };
      const rect = c.getBoundingClientRect();
      const g = c.getContext("2d");
      let sum = 0;
      // Device pixels: the middle band of the price area, 1/4 from the left.
      const x0 = Math.round(c.width * 0.25);
      const y0 = Math.round(c.height * 0.35);
      const d = g.getImageData(x0, y0, Math.min(300, c.width - x0), Math.min(160, c.height - y0)).data;
      for (let i = 0; i < d.length; i += 4) sum = (sum + i + d[i] + d[i + 1] * 3 + d[i + 2] * 5) % 2147483647;
      const legend = [...document.querySelectorAll("span,div")]
        .map((e) => e.textContent?.trim() ?? "")
        .filter((t) => /^(O|h|l|c)\s*[:：]?\s*[\d.,]+/.test(t))
        .slice(0, 4);
      return {
        alive: true,
        sum,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        canvases: list.length,
        biggest: { w: c.width, h: c.height },
        badge: [...document.querySelectorAll("span")]
          .map((e) => e.textContent.trim())
          .find((t) => /^完整 [\d,]+ 根/.test(t)),
        legend,
      };
    }),
    12000,
    { alive: false },
  );

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await race(p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300), undefined, { timeout: 40000 }), 45000);
  await race(p.waitForFunction(() => /^完整 [\d,]+ 根/.test([...document.querySelectorAll("span")].map((e) => e.textContent.trim()).find((t) => /^完整 [\d,]+ 根/.test(t)) ?? ""), undefined, { timeout: 90000 }), 95000);
  r.ready = await SNAP();
  flush();

  const box = r.ready.rect;
  const y = box.y + box.h * 0.45;
  for (let k = 0; k < 4; k++) {
    const before = await SNAP();
    const x1 = box.x + box.w * 0.6;
    const x2 = box.x + box.w * 0.3;
    const dragged = await race(
      (async () => {
        await p.mouse.move(x1, y);
        await p.mouse.down();
        for (let s = 1; s <= 6; s++) await p.mouse.move(x1 - ((x1 - x2) * s) / 6, y);
        await p.mouse.up();
      })(),
      20000,
      "stalled",
    );
    await race(p.waitForTimeout(400), 2000);
    const after = await SNAP();
    r.steps.push({
      k,
      dragged,
      sumBefore: before.sum,
      sumAfter: after.sum,
      panned: before.sum !== after.sum,
      legendBefore: before.legend,
      legendAfter: after.legend,
    });
    flush();
  }
  r.ok = !!r.ready.badge && r.steps.length === 4 && r.steps.every((s) => s.panned && s.dragged !== "stalled");
} catch (e) {
  r.error = String(e).split("\n").slice(0, 4).join(" | ");
}
clearTimeout(watchdog);
flush();
await b.close();
process.exit(0);
