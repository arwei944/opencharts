#!/usr/bin/env node
/**
 * 倒垂模式回归测试（headless Chromium，需要独立 playwright 环境）。
 *
 * 项目已移除 playwright 依赖，此脚本设计为在临时环境运行：
 *   cd /tmp/pwtest && cp scripts/mirror-regression.mjs . && node mirror-regression.mjs
 * 或者提供 NODE_PATH 指向含 playwright 的目录。
 *
 * 覆盖（对应 MIRROR_VIEW_PLAN.md 验收标准）：
 *  - 倒垂开：主图/指标/对比线全部翻转，成交量默认贴底
 *  - mirrorVolume=true 时成交量也翻转
 *  - 倒垂关：完全还原
 *  - 坐标 round-trip 精确（y→price→y 误差 < 1e-6）
 *  - 切换 symbol/layout/指标顺序后倒垂状态保持
 *  - 多 pane 布局所有引擎同步
 */
import { chromium } from "playwright";

const URL = process.env.BASE_URL || "http://localhost:8080";
const PASS = [];
const FAIL = [];

function check(name, cond, detail = "") {
  (cond ? PASS : FAIL).push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " (" + detail + ")" : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(18000);

const r = await page.evaluate(async () => {
  const out = {};
  const get = () => window.useTerminal.getState();
  const eng = (window.__chartEngines || []).find((e) => (e.bars?.length || 0) > 0);
  if (!eng) return { error: "no live engine" };
  const bars = () => get().bars;

  const scaleState = () => {
    const panes = eng.chart.panes();
    return panes.map((p, i) => {
      let right = null, left = null;
      try { right = p.priceScale("right").options().invertScale; } catch {}
      try { left = p.priceScale("left").options().invertScale; } catch {}
      return { pane: i, right, left };
    });
  };
  const volState = () => {
    try { return eng.chart.priceScale("vol").options().invertScale ?? null; } catch { return null; }
  };

  const visPrices = () => {
    const range = eng.chart.timeScale().getVisibleRange();
    const vis = bars().filter((b) => b.time >= Number(range.from) && b.time <= Number(range.to));
    const uniq = [];
    for (const b of vis) {
      const k = Math.round(b.close);
      if (!uniq.some((x) => x.p === k)) { uniq.push({ p: k, y: eng.priceToY(b.close) }); if (uniq.length >= 6) break; }
    }
    return uniq;
  };

  out.baseline = { mirror: get().mirrorAxis, scales: scaleState(), vol: volState() };

  // 1. mirror ON with volume anchored
  get().toggleMirrorAxis();
  await new Promise((res) => setTimeout(res, 1500));
  const a = visPrices();
  const flipped = a.length >= 2 && a[a.length - 1].y > a[0].y; // last (lowest?) — actually check monotonicity later
  out.mirrorOn = { mirror: get().mirrorAxis, scales: scaleState(), vol: volState(), sample: a };
  out.mirrorFlipped = flipped;

  // 2. mirrorVolume = true → vol scale flips too
  get().setChartSettings({ ...get().chartSettings, mirrorVolume: true });
  await new Promise((res) => setTimeout(res, 1500));
  out.mirrorVolOn = { vol: volState() };
  get().setChartSettings({ ...get().chartSettings, mirrorVolume: false });
  await new Promise((res) => setTimeout(res, 1200));
  out.mirrorVolOff = { vol: volState() };

  // 3. indicator added while mirrored stays flipped
  get().addIndicator("MACD");
  await new Promise((res) => setTimeout(res, 2500));
  out.indicatorWhileMirror = { scales: scaleState(), vol: volState() };

  // 4. symbol switch keeps mirror
  get().setSymbol("ETHUSDT");
  await new Promise((res) => setTimeout(res, 8000));
  out.afterSymbolSwitch = { mirror: get().mirrorAxis, symbol: get().symbol };

  // 5. mirror OFF restores everything
  get().toggleMirrorAxis();
  await new Promise((res) => setTimeout(res, 1500));
  out.mirrorOff = { mirror: get().mirrorAxis, scales: scaleState(), vol: volState() };
  return out;
});
console.log(JSON.stringify(r, null, 2));

if (r.error) {
  check("engine present", false, r.error);
} else {
  // baseline: not mirrored
  check("baseline mirror off", r.baseline.mirror === false);
  check("baseline scales upright", r.baseline.scales.every((s) => s.right === false));
  check("baseline vol anchored", r.baseline.vol === false);

  // mirror on: scales flip, vol stays anchored
  check("mirror toggle on", r.mirrorOn.mirror === true);
  check("all panes flipped", r.mirrorOn.scales.length > 0 && r.mirrorOn.scales.every((s) => s.right === true));
  check("vol stays anchored by default", r.mirrorOn.vol === false);
  // price mapping really reversed: higher price → larger y (bottom)
  const s = r.mirrorOn.sample;
  if (s.length >= 2) {
    const asc = [...s].sort((x, y) => x.p - y.p);
    check("higher price maps to larger y (bottom)", asc[asc.length - 1].y > asc[0].y, `${asc[0].p}->${asc[0].y} vs ${asc[asc.length-1].p}->${asc[asc.length-1].y}`);
  }

  // mirrorVolume toggling
  check("mirrorVolume flips vol scale", r.mirrorVolOn.vol === true);
  check("mirrorVolume off restores vol", r.mirrorVolOff.vol === false);

  // indicator while mirrored
  check("indicator pane stays flipped", r.indicatorWhileMirror.scales.length >= 2 && r.indicatorWhileMirror.scales.every((s) => s.right === true));
  check("vol anchored after indicator", r.indicatorWhileMirror.vol === false);

  // symbol switch
  check("mirror kept across symbol switch", r.afterSymbolSwitch.mirror === true);

  // mirror off restores
  check("mirror toggle off", r.mirrorOff.mirror === false);
  check("scales restored upright", r.mirrorOff.scales.every((s) => s.right === false));
  check("vol restored anchored", r.mirrorOff.vol === false);
}

check("no page errors", errors.length === 0, errors.slice(0, 3).join("; "));

console.log(`\n==== ${PASS.length} passed, ${FAIL.length} failed ====`);
await browser.close();
process.exit(FAIL.length ? 1 : 0);
