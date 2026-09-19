/** Central place for all chart settings that were previously hardcoded. */
export interface ChartSettings {
  /** Crosshair line width (px). */
  crosshairWidth: number;
  /** Crosshair marker size (px). */
  crosshairMarkerSize: number;
  /** Crosshair label background color. */
  crosshairLabelBg: string;
  /** Bar spacing between candles (px). */
  barSpacing: number;
  /** Time scale right offset (candles to left/right of viewport edge). */
  timeRightOffset: number;
  /** Price scale top/bottom margins as fractions [top, bottom]. */
  priceScaleMargins: [number, number];
  /** Volume panel height fraction (bottom portion of main pane). */
  volumeHeight: number;
  /** Default indicators to show on load. */
  defaultIndicators: { kind: string; params?: number[] }[];
  /** Compare series colors. */
  compareColors: string[];
  /** Indicator line widths (per indicator type). */
  lineWidths: Partial<Record<string, number>>;
  /** Crosshair vertical line style. */
  crosshairLineStyle: 0 | 1 | 2 | 3; // LineStyle.None/Normal/Dashed/Dotted
  
  // 📱 Mobile Touch Gesture Settings
  touchPanSensitivity?: number;     // Horizontal pan sensitivity multiplier (default: 1)
  touchDoubleTapDelay?: number;      // Double tap detection delay in ms (default: 300)
  touchLongPressDelay?: number;      // Long press detection delay in ms (default: 500)
  
  // ✨ Candle Visual Customization
  candleThickness?: number;          // Width of each candle/bar (px) - overrides barSpacing
  candleColorUp?: string;            // Up candle/wick color (hex)
  candleColorDown?: string;          // Down candle/wick color (hex)
  wickColorUp?: string;              // Wick up color only (overrides candleColorUp)
  wickColorDown?: string;            // Wick down color only (overrides candleColorDown)
  initialZoom?: "fit" | "tight" | "wide"; // Initial view range ("fit" = auto, "tight" = recent bars, "wide" = all bars)
}

export const DEFAULT_SETTINGS: ChartSettings = {
  crosshairWidth: 1,
  crosshairMarkerSize: 4,
  crosshairLabelBg: "#8b9dc4",
  barSpacing: 7,
  timeRightOffset: 8,
  priceScaleMargins: [0.06, 0.2],
  volumeHeight: 0.82,
  defaultIndicators: [{ kind: "MA", params: [9] }, { kind: "BOLL" }],
  compareColors: ["#f0b90b", "#00d4ff"],
  lineWidths: { MA: 1, BOLL: 1, MACD_DIF: 1, RSI: 1 },
  crosshairLineStyle: 2, // Dashed
  
  // 📱 Mobile Touch Gesture Defaults
  touchPanSensitivity: 1,       // 1:1 ratio
  touchDoubleTapDelay: 300,     // 300ms
  touchLongPressDelay: 500,     // 500ms
  
  // ✨ Candle Visual Defaults
  candleThickness: undefined,   // Will auto-calculate based on barSpacing
  candleColorUp: undefined,     // Uses chart theme default
  candleColorDown: undefined,   // Uses chart theme default
  wickColorUp: undefined,       // No override
  wickColorDown: undefined,     // No override
  initialZoom: "fit",           // Auto-fit to visible data
};
