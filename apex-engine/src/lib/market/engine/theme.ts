import {
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { resolveThemePalette } from "../../plugins/registry.ts";
import type { ThemeMode } from "../constants.ts";
import { formatTime } from "../timefmt.ts";
import type { DEFAULT_SETTINGS } from "../settings.ts";

/**
 * Chart-level appearance: theme palettes, typography, timezone and the
 * inverted-axis (倒垂) mirror state. Extracted from ChartEngine (P0-A1) so the
 * engine facade only wires managers together. `syncMirror` is reachable by the
 * CompareManager and commit paths through the engine's callback wiring.
 */
export class ThemeManager {
  private mode: ThemeMode = "dark";
  private mirror = false;

  constructor(
    private chart: IChartApi,
    initialMode: ThemeMode,
    private getSettings: () => typeof DEFAULT_SETTINGS,
    /** Engine-owned: whether the volume pane joins the mirror (default no). */
    private getMirrorVolume: () => boolean,
  ) {
    this.mode = initialMode;
  }

  get current(): ThemeMode {
    return this.mode;
  }

  get isMirrored(): boolean {
    return this.mirror;
  }

  setTheme(mode: ThemeMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const pal = resolveThemePalette(mode as string);
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
      },
      grid: {
        vertLines: {
          color: pal.grid,
          style: this.getSettings().gridLineStyle as any,
        },
        horzLines: {
          color: pal.grid,
          style: this.getSettings().gridLineStyle as any,
        },
      },
      crosshair: {
        vertLine: { color: pal.text, labelBackgroundColor: pal.axisLabel },
        horzLine: { color: pal.text, labelBackgroundColor: pal.axisLabel },
      },
      rightPriceScale: { borderColor: pal.grid },
      leftPriceScale: { borderColor: pal.grid },
      timeScale: { borderColor: pal.grid },
    });
  }

  /** Re-apply typography (font size/family) live. */
  applyTypography(s: typeof DEFAULT_SETTINGS) {
    this.chart.applyOptions({
      layout: {
        fontSize: s.fontSize ?? 11,
        fontFamily: s.fontFamily ?? "IBM Plex Sans, sans-serif",
      },
      grid: {
        vertLines: {
          color: resolveThemePalette(this.mode as string).grid,
          style: s.gridLineStyle as any,
        },
        horzLines: {
          color: resolveThemePalette(this.mode as string).grid,
          style: s.gridLineStyle as any,
        },
      },
    });
  }

  /**
   * Time-axis timezone (incl. DST through Intl). "local" keeps the browser
   * clock; any IANA zone renders axis/legend times in that zone.
   */
  setTimezone(zone: string) {
    this.chart.applyOptions({
      localization: {
        timeFormatter: (t: UTCTimestamp) => formatTime(t, zone),
      },
    });
  }

  /**
   * 倒垂（价格轴翻转）：高价落到底部、低价升到顶部，坐标轴读数仍是真实价格。
   * 用 lightweight-charts 原生的 `invertScale`，而不是伪造的 margin 抖动 ——
   * 后者只是把画面往上挪，K 线形状根本没翻。
   */
  setMirror(v: boolean) {
    if (this.mirror === v) return;
    this.mirror = v;
    this.syncMirror();
  }

  /**
   * `invertScale` 属于「每个 pane 的每条标尺」，而 pane 和标尺都是随系列创建才出现的：
   * 指标线会新建副图 pane，对比线会新建 left 标尺。所以每次系列结构变化后都要重新
   * 下一道命令，否则「先开倒垂、后加载指标」会有一半画面偷偷正回来。
   *
   * 成交量走独立的 `vol` 标尺，故意为之不翻 —— 它始终贴在底部，与币安/TradingView 一致。
   */
  syncMirror() {
    const panes = this.chart.panes();
    for (let i = 0; i < panes.length; i++) {
      for (const id of ["right", "left"] as const) {
        try {
          panes[i].priceScale(id).applyOptions({ invertScale: this.mirror });
        } catch {
          /* 这个 pane 没有该标尺（例如没有对比线时的 left） */
        }
      }
    }
    // 成交量独立 vol 标尺：默认不翻（贴底），mirrorVolume 打开时随倒垂一起翻。
    try {
      this.chart
        .priceScale("vol")
        .applyOptions({ invertScale: this.mirror && this.getMirrorVolume() });
    } catch {
      /* 成交量未创建时没有 vol 标尺 */
    }
  }
}
