import fs from "node:fs";
import { chromium } from "playwright";

// Profile the steady state right after the reveal: name the functions eating the
// main thread while nobody touches the chart.
const BUDGET_MS = Number(process.argv[2] ?? 150) * 1000;
const OUT = ".trash/probe5.json";
const r = { startedAt: new Date().toISOString() };
const flush = () => fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
const watchdog = setTimeout(() => {
  r.timeout = true;
  flush();
  process.exit(0);
}, BUDGET_MS);
const race = (pr, ms, tag) => Promise.race([pr, new Promise((res) => setTimeout(() => res(tag), ms))]);

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => {
  r.pageErrors = [...(r.pageErrors ?? []), String(e).slice(0, 200)];
  flush();
});
await ctx.addInitScript(() => {
  window.__t0 = performance.now();
  window.__f = { frames: 0, last: performance.now() };
  const step = (t) => {
    window.__f.frames++;
    window.__f.last = t;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

try {
  await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
  r.badgeWait = await race(
    p.waitForFunction(() => [...document.querySelectorAll("span")].some((el) => /^完整 [\d,]+ 根/.test(el.textContent.trim())), undefined, {
      timeout: 100000,
      polling: 1000,
    }),
    110000,
    "no-complete",
  ).then((v) => (v === "no-complete" ? "timeout" : "ok"));
  await p.waitForTimeout(6000);
  const f0 = await race(p.evaluate(() => window.__f.frames), 8000, null);
  if (f0 === null) {
    r.wedgedBeforeProfile = true;
    r.badge = await race(p.evaluate(() => document.body.innerText.slice(0, 0)), 4000, "dead");
    throw new Error("renderer unresponsive before profiling");
  }

  const cdp = await ctx.newCDPSession(p);
  await race(cdp.send("Profiler.enable"), 8000, "x");
  await race(cdp.send("Profiler.setSamplingInterval", { interval: 300 }), 8000, "x");
  await race(cdp.send("Profiler.start"), 8000, "x");
  await p.waitForTimeout(5000);
  const stopped = await race(cdp.send("Profiler.stop"), 25000, "profile-timeout");
  const f1 = await race(p.evaluate(() => window.__f.frames), 8000, null);
  r.fpsDuringProfile = f1 == null ? "dead" : +((f1 - f0) / 5).toFixed(1);
  if (typeof stopped === "string") {
    r.profile = stopped;
  } else {
    const prof = stopped.profile;
    const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const samples = prof.samples.length;
    for (const id of prof.samples) {
      const n = nodes.get(id);
      if (!n) continue;
      const cf = n.callFrame;
      const key = `${cf.functionName || "(anonymous)"}  @${(cf.url || "").split("/").pop()}:${cf.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + 1);
    }
    r.totalSamples = samples;
    r.top = [...self.entries()]
      .sort((a, z) => z[1] - a[1])
      .slice(0, 22)
      .map(([k, n]) => [k, n, +(100 * (n / samples)).toFixed(1) + "%"]);
  }
} catch (e) {
  r.error = String(e).split("\n").slice(0, 3).join(" | ");
} finally {
  clearTimeout(watchdog);
  flush();
  await b.close().catch(() => {});
}
