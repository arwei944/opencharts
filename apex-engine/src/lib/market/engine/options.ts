import {
  ColorType,
  CrosshairMode,
  type DeepPartial,
  type ChartOptions,
  type LineWidth,
} from "lightweight-charts";
import { CHART_THEME } from "../constants.ts";
import type { ThemeMode } from "../constants.ts";
import type { DEFAULT_SETTINGS } from "../settings.ts";

/**
 * Pure chart-options builder (P0-A1). The 150-line createChart options object
 * used to live inline in the ChartEngine constructor; extracted so the engine
 * constructor stays a wiring pass and the palette/settings mapping is
 * unit-testable in isolation.
 */
export function buildChartOptions(
  mode: ThemeMode,
  settings: typeof DEFAULT_SETTINGS,
): DeepPartial<ChartOptions> {
  const pal = CHART_THEME[mode];
  return {
    layout: {
      background: { type: ColorType.Solid, color: pal.bg },
      textColor: pal.text,
      fontFamily: settings.fontFamily ?? "IBM Plex Sans, sans-serif",
      fontSize: settings.fontSize ?? 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: pal.grid, style: settings.gridLineStyle as any },
      horzLines: { color: pal.grid, style: settings.gridLineStyle as any },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: pal.text,
        width: settings.crosshairWidth as LineWidth,
        style: settings.crosshairLineStyle as any,
        labelBackgroundColor: settings.crosshairLabelBg,
      },
      horzLine: {
        color: pal.text,
        width: settings.crosshairWidth as LineWidth,
        style: settings.crosshairLineStyle as any,
        labelBackgroundColor: settings.crosshairLabelBg,
      },
    },
    // Mouse drag-pan is implemented by PointerController (custom sensitivity +
    // grab/grabbing cursor), so disable the library's baked-in 1:1 drag;
    // everything else (wheel, axis scale, pinch) stays native.
    handleScroll: {
      pressedMouseMove: false,
      mouseWheel: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
      mouseWheel: true,
      pinch: true,
    },
    rightPriceScale: {
      borderColor: pal.grid,
      scaleMargins: {
        top: settings.priceScaleMargins[0],
        bottom: settings.priceScaleMargins[1],
      },
    },
    leftPriceScale: {
      visible: false,
      borderColor: pal.grid,
      scaleMargins: {
        top: settings.priceScaleMargins[0],
        bottom: settings.priceScaleMargins[1],
      },
    },
    timeScale: {
      borderColor: pal.grid,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: settings.timeRightOffset,
      barSpacing: settings.barSpacing,
      // Default minBarSpacing (0.5px) caps the zoomed-out view at ~viewport/0.5
      // bars, so a 100k-series can never be seen in full — and the viewport
      // never reaches the loaded front, which is what triggers the infinite
      // backfill (ensureCoverage/extendHistory). Lower the floor so zoom-out
      // covers every resident bar; 0.01 still clamps at ~viewport/0.0114, so
      // 0.001 it is (measured: fitContent reaches bar 0).
      minBarSpacing: 0.001,
    },
    autoSize: true,
  };
}
