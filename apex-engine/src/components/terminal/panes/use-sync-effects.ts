import { useEffect } from "react";
import type { RefObject } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { COMPARE_COLORS } from "@/lib/market/constants";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { Interval } from "@/lib/market/types";

/**
 * One-way engine state sync (P3-A4): every store change that must be mirrored
 * into the running chart (type/invert/mirror/volume/pan/theme/typography),
 * the data path (setFullData + live updateLastBar), indicator adoption and the
 * compare-series reconciliation. Effects key on `ready` so a lazily-booted
 * engine re-applies the initial state once it exists.
 */
export function useSyncEffects(
  eng: RefObject<ChartEngine | null>,
  ready: number,
  paneId: string,
  master: boolean,
  interval: Interval,
) {
  const chartType = useTerminal((s) => s.chartType);
  const invert = useTerminal((s) => s.invert);
  const mirrorAxis = useTerminal((s) => s.mirrorAxis);
  const logScale = useTerminal((s) => s.logScale);
  const showVol = useTerminal((s) => s.showVol);
  const mirrorVolume = useTerminal((s) => !!s.chartSettings.mirrorVolume);
  const mousePan = useTerminal((s) => s.chartSettings.mousePanSensitivity ?? 1);
  const tool = useTerminal((s) => s.tool);
  const indicators = useTerminal((s) => s.indicators);
  const customFns = useTerminal((s) => s.customFns);
  const theme = useTerminal((s) => s.theme);
  const chartSettings = useTerminal((s) => s.chartSettings);
  const bars = useTerminal((s) =>
    master ? s.bars : (s.paneBars[paneId] ?? NO_BARS),
  );
  const lastBar = useTerminal((s) =>
    master ? s.lastBar : ((s.paneBars[paneId] ?? NO_BARS).at(-1) ?? null),
  );
  const historyKey_ = useTerminal((s) =>
    master
      ? `${s.market}:${s.symbol}:${s.interval}`
      : `${s.market}:${s.symbol}:${interval}`,
  );
  const historyPhase = useTerminal((s) => s.historyStatus[historyKey_]?.phase);
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  const compareBars = useTerminal((s) => s.compareBars);

  useEffect(() => {
    eng.current?.setInterval(interval);
  }, [interval, ready, eng]);
  useEffect(() => {
    eng.current?.setType(chartType);
  }, [chartType, ready, eng]);
  useEffect(() => {
    eng.current?.setInvert(invert);
  }, [invert, ready, eng]);
  useEffect(() => {
    eng.current?.setMirror(mirrorAxis);
  }, [mirrorAxis, ready, eng]);
  useEffect(() => {
    eng.current?.setMirrorVolume(mirrorVolume);
  }, [mirrorVolume, ready, eng]);
  // Mouse drag sensitivity + grab/grabbing cursor. Drawing tools use a
  // crosshair; the pan cursor (grab) applies only to the default/cross tools.
  useEffect(() => {
    eng.current?.setPanSensitivity(mousePan);
  }, [mousePan, ready, eng]);
  useEffect(() => {
    eng.current?.setCursor(tool === "cursor" ? "default" : "crosshair");
  }, [tool, ready, eng]);
  useEffect(() => {
    eng.current?.setLog(logScale);
  }, [logScale, ready, eng]);
  useEffect(() => {
    eng.current?.setShowVol(showVol);
  }, [showVol, ready, eng]);
  useEffect(() => {
    eng.current?.setTheme(theme);
  }, [theme, ready, eng]);
  // Typography / price-precision changes apply live to the running engine.
  useEffect(() => {
    eng.current?.applyTypography(chartSettings);
  }, [chartSettings, ready, eng]);
  useEffect(() => {
    eng.current?.setFullData(bars, historyPhase !== "complete");
  }, [bars, historyPhase, ready, eng]);

  // Live path: in-place tail updates repaint via the engine's cheap
  // updateLastBar instead of re-committing the whole series.
  useEffect(() => {
    if (lastBar) eng.current?.updateLastBar(lastBar);
  }, [lastBar, ready, eng]);

  useEffect(() => {
    eng.current?.setIndicators(master ? indicators : []);
  }, [indicators, master, ready, eng]);
  useEffect(() => {
    eng.current?.setCustomFns(master ? customFns : {});
  }, [customFns, master, ready, eng]);

  // Compare-series reconciliation: add/update/remove to match the store.
  useEffect(() => {
    const engine = eng.current;
    if (!engine || !master) return;
    const live = new Set(compareSymbols);
    for (const sym of engine.compareKeys()) {
      if (!live.has(sym)) engine.removeCompare(sym);
    }
    compareSymbols.forEach((sym, i) => {
      const list = compareBars[sym] ?? [];
      if (!list.length) return;
      const color = COMPARE_COLORS[i] ?? "#00d4ff";
      if (!engine.hasCompare(sym)) engine.setCompare(sym, list, color);
      else engine.updateCompare(sym, list[list.length - 1], list);
    });
  }, [compareBars, compareSymbols, master, ready, eng]);
}
