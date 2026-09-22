import type { ChartType, IndicatorKind, Interval, Tool } from "./types";

export const INTERVALS: { id: Interval; label: string }[] = [
  { id: "1s", label: "1秒" },
  { id: "1m", label: "1分" },
  { id: "3m", label: "3分" },
  { id: "5m", label: "5分" },
  { id: "15m", label: "15分" },
  { id: "30m", label: "30分" },
  { id: "1h", label: "1小时" },
  { id: "2h", label: "2小时" },
  { id: "4h", label: "4小时" },
  { id: "6h", label: "6小时" },
  { id: "8h", label: "8小时" },
  { id: "12h", label: "12小时" },
  { id: "1d", label: "1日" },
  { id: "3d", label: "3日" },
  { id: "1w", label: "1周" },
  { id: "1M", label: "1月" },
];

export const INTERVAL_MS: Record<Interval, number> = {
  "1s": 1_000,
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candle", label: "蜡烛图" },
  { id: "hollow", label: "空心蜡烛" },
  { id: "bar", label: "OHLC" },
  { id: "line", label: "折线" },
  { id: "area", label: "面积" },
  { id: "ha", label: "平均K" },
];

export const TOOLS: { id: Tool; label: string }[] = [
  { id: "cursor", label: "指针" },
  { id: "cross", label: "十字" },
  { id: "order", label: "下单" },
  { id: "text", label: "文字" },
  { id: "trend", label: "趋势线" },
  { id: "arrow", label: "箭头" },
  { id: "ray", label: "射线" },
  { id: "hline", label: "水平线" },
  { id: "vline", label: "垂直线" },
  { id: "rect", label: "矩形" },
  { id: "fib", label: "斐波那契" },
  { id: "parallel", label: "平行通道" },
  { id: "measure", label: "测距" },
  { id: "price-range", label: "价格区间" },
  { id: "fib-ext", label: "斐波那契扩展" },
  { id: "fib-time-zone", label: "斐波那契时间" },
  { id: "ellipse", label: "椭圆" },
  { id: "gann-fan", label: "江恩扇" },
  { id: "wedge", label: "楔形" },
  { id: "pitchfork", label: "音叉" },
  { id: "symmetry", label: "对称" },
];

/** One-click indicator groups (layout-preset style). */
export const INDICATOR_PRESETS: {
  id: string;
  name: string;
  indicators: { kind: string; params?: number[] }[];
}[] = [
  {
    id: "trend",
    name: "趋势组",
    indicators: [
      { kind: "MA", params: [7, 25, 99] },
      { kind: "EMA", params: [12, 26] },
      { kind: "BOLL" },
    ],
  },
  {
    id: "osc",
    name: "震荡组",
    indicators: [
      { kind: "RSI", params: [14] },
      { kind: "MACD" },
      { kind: "VOL" },
    ],
  },
  {
    id: "momentum",
    name: "动量组",
    indicators: [
      { kind: "KDJ" },
      { kind: "WR", params: [14] },
      { kind: "DMI", params: [14] },
    ],
  },
  {
    id: "volume",
    name: "量价组",
    indicators: [
      { kind: "OBV" },
      { kind: "MFI", params: [14] },
      { kind: "ATR", params: [14] },
    ],
  },
];

export const INDICATOR_CATALOG: {
  kind: IndicatorKind;
  name: string;
  group: "main" | "sub";
  defaults: number[];
  labels: string[];
}[] = [
  {
    kind: "MA",
    name: "MA 均线",
    group: "main",
    defaults: [7, 25, 99],
    labels: ["MA1", "MA2", "MA3"],
  },
  {
    kind: "EMA",
    name: "EMA 指数均线",
    group: "main",
    defaults: [12, 26],
    labels: ["快", "慢"],
  },
  {
    kind: "BOLL",
    name: "BOLL 布林带",
    group: "main",
    defaults: [20, 2],
    labels: ["周期", "倍数"],
  },
  {
    kind: "SAR",
    name: "SAR 抛物线",
    group: "main",
    defaults: [0.02, 0.2],
    labels: ["步长", "极限"],
  },
  { kind: "VWAP", name: "VWAP", group: "main", defaults: [], labels: [] },
  {
    kind: "SUPER",
    name: "Supertrend",
    group: "main",
    defaults: [10, 3],
    labels: ["ATR", "倍数"],
  },
  { kind: "VOL", name: "成交量", group: "sub", defaults: [], labels: [] },
  {
    kind: "MACD",
    name: "MACD",
    group: "sub",
    defaults: [12, 26, 9],
    labels: ["快", "慢", "信号"],
  },
  { kind: "RSI", name: "RSI", group: "sub", defaults: [14], labels: ["周期"] },
  {
    kind: "KDJ",
    name: "KDJ",
    group: "sub",
    defaults: [9, 3, 3],
    labels: ["N", "M1", "M2"],
  },
  {
    kind: "STOCH",
    name: "Stochastic",
    group: "sub",
    defaults: [14, 3],
    labels: ["K", "D"],
  },
  {
    kind: "WR",
    name: "Williams %R",
    group: "sub",
    defaults: [14],
    labels: ["周期"],
  },
  { kind: "CCI", name: "CCI", group: "sub", defaults: [14], labels: ["周期"] },
  { kind: "OBV", name: "OBV", group: "sub", defaults: [], labels: [] },
  { kind: "ATR", name: "ATR", group: "sub", defaults: [14], labels: ["周期"] },
  {
    kind: "DMI",
    name: "DMI/ADX",
    group: "sub",
    defaults: [14],
    labels: ["周期"],
  },
  {
    kind: "STOCHRSI",
    name: "StochRSI",
    group: "sub",
    defaults: [14, 14, 3, 3],
    labels: ["RSI", "随机", "%K", "%D"],
  },
  {
    kind: "MFI",
    name: "MFI 资金流量",
    group: "sub",
    defaults: [14],
    labels: ["周期"],
  },
  {
    kind: "AROON",
    name: "AROON",
    group: "sub",
    defaults: [25],
    labels: ["周期"],
  },
  {
    kind: "TRIX",
    name: "TRIX",
    group: "sub",
    defaults: [15],
    labels: ["周期"],
  },
  {
    kind: "ROC",
    name: "ROC 变化率",
    group: "sub",
    defaults: [12],
    labels: ["周期"],
  },
  {
    kind: "MOM",
    name: "MOM 动量",
    group: "sub",
    defaults: [10],
    labels: ["周期"],
  },
  {
    kind: "PPO",
    name: "PPO",
    group: "sub",
    defaults: [12, 26, 9],
    labels: ["快", "慢", "信号"],
  },
  {
    kind: "CMF",
    name: "CMF 资金流",
    group: "sub",
    defaults: [20],
    labels: ["周期"],
  },
  {
    kind: "WMA",
    name: "WMA 加权均线",
    group: "main",
    defaults: [9, 21],
    labels: ["WMA1", "WMA2"],
  },
  {
    kind: "TRIMA",
    name: "TRIMA 三重均线",
    group: "main",
    defaults: [20],
    labels: ["周期"],
  },
  {
    kind: "VWMA",
    name: "VWMA 量权均线",
    group: "main",
    defaults: [20],
    labels: ["周期"],
  },
  {
    kind: "NATR",
    name: "NATR 归一化ATR",
    group: "sub",
    defaults: [14],
    labels: ["周期"],
  },
  {
    kind: "BBW",
    name: "BBW 布林带宽",
    group: "sub",
    defaults: [20, 2],
    labels: ["周期", "倍数"],
  },
  {
    kind: "DPO",
    name: "DPO 去趋势",
    group: "sub",
    defaults: [20],
    labels: ["周期"],
  },
  {
    kind: "TSI",
    name: "TSI 真实强度",
    group: "sub",
    defaults: [25, 13],
    labels: ["长", "短"],
  },
  {
    kind: "AO",
    name: "AO 动量振荡",
    group: "sub",
    defaults: [5, 34],
    labels: ["快", "慢"],
  },
];

export const LAYOUTS: { id: import("./types").ChartLayout; label: string }[] = [
  { id: "1", label: "1" },
  { id: "1x2", label: "1×2" },
  { id: "2x1", label: "2×1" },
  { id: "2x2", label: "2×2" },
];

export const PANE_COUNT: Record<import("./types").ChartLayout, number> = {
  "1": 1,
  "1x2": 2,
  "2x1": 2,
  "2x2": 4,
};

export const DEFAULT_PANE_INTERVALS: import("./types").Interval[] = [
  "15m",
  "1h",
  "4h",
  "1d",
];

export const COMPARE_COLORS = [
  "#00d4ff",
  "#c084fc",
  "#fb7185",
  "#34d399",
  "#fbbf24",
];

// Depth a series is filled to before it counts as "complete". Coarse intervals go
// back to the exchange's first bar (sinceMs: 0); fine intervals stop at a time
// window so the fetch count and the resident array stay bounded.
const DAY = 86_400_000;
const YEAR = 365 * DAY;

export type Horizon = { bars: number; sinceMs: number };

export const INTERVAL_HORIZON: Record<Interval, Horizon> = {
  "1s": { bars: 3_600, sinceMs: 3_600_000 },
  "1m": { bars: 45_000, sinceMs: 30 * DAY },
  "3m": { bars: 30_000, sinceMs: 60 * DAY },
  "5m": { bars: 45_000, sinceMs: 180 * DAY },
  "15m": { bars: 105_000, sinceMs: 3 * YEAR },
  "30m": { bars: 70_000, sinceMs: 5 * YEAR },
  "1h": { bars: 90_000, sinceMs: 0 },
  "2h": { bars: 50_000, sinceMs: 0 },
  "4h": { bars: 30_000, sinceMs: 0 },
  "6h": { bars: 20_000, sinceMs: 0 },
  "8h": { bars: 15_000, sinceMs: 0 },
  "12h": { bars: 10_000, sinceMs: 0 },
  "1d": { bars: 5_000, sinceMs: 0 },
  "3d": { bars: 2_000, sinceMs: 0 },
  "1w": { bars: 1_000, sinceMs: 0 },
  "1M": { bars: 400, sinceMs: 0 },
};

/** Hard memory guard for one resident series, well above any horizon.bars. */
export const BAR_CAP = 220_000;

/**
 * Sub-pane resident cap: a side pane only renders its tail + recomputes the
 * indicator tail, so it never needs the full history. This is the memory
 * windowing step — the four pane arrays used to hold up to 4×220k bars.
 */
export const PANE_CAP = 12_000;

export const HISTORY_PAGE = 1000;

/** Pages fetched per wave while filling history backwards. */
export const PREFILL_CONCURRENCY = 4;

/** Only every N committed bars do we snapshot the series into IndexedDB. */
export const PREFILL_CACHE_CHECKPOINT = 20_000;

/** 429 / network backoff between waves. */
export const PREFILL_RETRY_MS = 1_500;

/**
 * Live ticks recompute indicators, so that path reads this tail slice instead of
 * a 100k-bar array. It grows between history commits and is re-anchored by each
 * commit, which keeps accumulation-based indicators on one origin.
 */
export const IND_TAIL_BARS = 4_000;
export const IND_TAIL_GROW = 2_000;

/** How far ahead of the viewport left edge we insist on loaded data. */
export const VIEWPORT_LOOKAHEAD_BARS = 2_000;

export const DEFAULT_WATCH = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "DOTUSDT",
  "NEARUSDT",
  "PEPEUSDT",
  "WIFUSDT",
  "AAVEUSDT",
];

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const UP = "#0ecb81";
export const DOWN = "#f6465d";
export const BG = "#0b0e11";
export const GRID = "#1e2329";
export const TEXT = "#848e9c";

export type ThemeMode = "dark" | "light" | "ocean" | "sand";

/** User theme preference: explicit mode, or follow the OS. */
export type ThemePref = ThemeMode | "system";

/** Light-ish presets (used by system-follow to pick a light theme). */
export const LIGHT_THEMES: ThemeMode[] = ["light", "sand"];

/** Chart-canvas palette per theme. Accent colours (candles, gold, compare lines)
 * are shared; only the surface, grid, axis text and crosshair label differ. */
export const CHART_THEME: Record<
  ThemeMode,
  { bg: string; grid: string; text: string; axisLabel: string }
> = {
  dark: {
    bg: "#0b0e11",
    grid: "#1e2329",
    text: "#848e9c",
    axisLabel: "#2b3139",
  },
  light: {
    bg: "#ffffff",
    grid: "#e6e9ee",
    text: "#707a89",
    axisLabel: "#e6e9ee",
  },
  ocean: {
    bg: "#0a1220",
    grid: "#16263a",
    text: "#8fa8c8",
    axisLabel: "#1a2a42",
  },
  sand: {
    bg: "#faf6ee",
    grid: "#ece3d1",
    text: "#6d6150",
    axisLabel: "#ece3d1",
  },
};
