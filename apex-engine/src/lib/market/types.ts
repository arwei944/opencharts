export type Market = "spot" | "usdm";

export type Interval =
  | "1s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export type ChartType = "candle" | "hollow" | "bar" | "line" | "area" | "ha";

export type ChartLayout = "1" | "1x2" | "2x1" | "2x2";

export interface ChartPaneConfig {
  id: string;
  interval: Interval;
}

export interface TimeRange {
  from: number;
  to: number;
}

export interface CrosshairLink {
  time: number;
  price: number;
  paneId: string;
}

export type Tool =
  | "cursor"
  | "cross"
  | "trend"
  | "ray"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "parallel"
  | "measure";

export type IndicatorKind =
  | "MA"
  | "EMA"
  | "BOLL"
  | "SAR"
  | "VWAP"
  | "SUPER"
  | "VOL"
  | "MACD"
  | "RSI"
  | "KDJ"
  | "WR"
  | "CCI"
  | "OBV"
  | "ATR"
  | "STOCH"
  | "CUSTOM";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed?: boolean;
}

export interface Ticker {
  last: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  change: number;
  changePct: number;
}

export interface BookLevel {
  price: number;
  qty: number;
}

export interface TapeTrade {
  id: string;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface IndicatorInst {
  id: string;
  kind: IndicatorKind;
  params: number[];
  visible: boolean;
  /** Target sub-pane number (1-based). Undefined = default (auto / main overlay). */
  pane?: number;
}

export interface DrawPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  tool: Tool;
  points: DrawPoint[];
  color: string;
}

export interface WatchItem {
  symbol: string;
  last: number;
  changePct: number;
  volume: number;
}

export type HistoryPhase = "tail" | "prefill" | "complete" | "error";

/**
 * Progress of filling one series (symbol × market × interval) to its depth
 * limit. `complete` means the resident array already holds every bar the mouse
 * can reach — panning left is then a pure reveal, never a fetch.
 */
export interface HistoryStatus {
  phase: HistoryPhase;
  bars: number;
  target: number;
  oldest: number;
  newest: number;
  floorTime: number;
  cached: boolean;
}
