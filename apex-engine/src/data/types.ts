/**
 * ApexChart Data Layer - Type Definitions
 * 
 * 统一的数据类型定义，为数据层提供强类型支持
 */

export type Market = 'spot' | 'usdm' | 'future';

export type Interval = 
  | '1s' | '1m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '8h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

/** K 线数据结构 */
export interface Candle {
  time: number;           // Unix 时间戳（秒）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** ticker 数据结构 */
export interface Ticker {
  symbol: string;
  last: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  change: number;
  changePct: number;
}

/** 订单簿深度数据 */
export interface BookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

/** 实时成交数据 */
export interface Trade {
  id: number;
  price: number;
  qty: number;
  isBuyerMaker: boolean;
  time: number;
}

/** 24 小时聚合信息 */
export interface WatchItem {
  symbol: string;
  last: number;
  changePct: number;
  volume: number;
}

/** 资金费率信息 */
export interface PremiumIndex {
  symbol: string;
  mark: number;
  funding: number;
  next: number;
}

/** 搜索建议 */
export interface SearchSuggestion {
  symbol: string;
  type: 'spot' | 'future';
  baseAsset: string;
  quoteAsset: string;
}

/** API 请求参数 */
export interface KlineParams {
  symbol: string;
  market: Market;
  interval: Interval;
  startTime?: number;     // Unix 时间戳（毫秒）
  endTime?: number;       // Unix 时间戳（毫秒）
  limit?: number;         // 返回数量限制 (1-1000)
}

/** REST API 配置 */
export interface RestApiConfig {
  spotHosts: string[];
  futureHosts: string[];
  timeoutMs?: number;
  retryAttempts?: number;
  headers?: Record<string, string>;
}

/** WebSocket 配置 */
export interface WebSocketConfig {
  spotUrl: string;
  futureUrl: string;
  heartbeatMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

/** 缓存配置 */
export interface CacheConfig {
  dbName?: string;
  storeName?: string;
  maxEntries?: number;
  expirationMs?: number;
  syncIntervalMs?: number;
}

/** 数据供应器选项 */
export interface DataProviderOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  
  /** 缓存配置 */
  cacheConfig?: CacheConfig;
  
  /** REST API 配置 */
  restApiConfig?: Partial<RestApiConfig>;
  
  /** WebSocket 配置 */
  wsConfig?: Partial<WebSocketConfig>;
  
  /** 是否允许使用模拟数据（用于测试） */
  fallbackToMock?: boolean;
  
  /** 自定义模拟数据生成器 */
  mockDataGenerator?: (params: KlineParams) => Candle[];
}

/** 数据供应器接口 */
export interface DataProvider {
  /** 获取历史 K 线数据 */
  getBars: (
    symbol: string,
    market: Market,
    interval: Interval,
    count?: number
  ) => Promise<Candle[]>;
  
  /** 订阅实时 tick */
  subscribeTick: (
    symbol: string,
    market: Market,
    callback: (tick: Candle) => void
  ) => () => void; // 返回取消订阅函数
  
  /** 获取 ticker 信息 */
  getTicker?: (
    symbol: string,
    market: Market
  ) => Promise<Ticker | null>;
  
  /** 获取订单簿 */
  getOrderBook?: (
    symbol: string,
    market: Market,
    depth?: number
  ) => Promise<OrderBook | null>;
  
  /** 搜索交易对 */
  searchSymbols?: (
    query: string,
    market: Market,
    limit?: number
  ) => Promise<SearchSuggestion[]>;
  
  /** 清理所有连接和缓存 */
  disconnect: () => Promise<void>;
}

/** 错误类型 */
export enum DataErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  EMPTY_DATA = 'EMPTY_DATA',
  CACHE_ERROR = 'CACHE_ERROR',
  WS_ERROR = 'WS_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
}

/** 数据层错误 */
export class DataError extends Error {
  code: DataErrorCode;
  originalError?: Error;
  context?: Record<string, any>;
  
  constructor(
    message: string,
    code: DataErrorCode,
    options?: {
      originalError?: Error;
      context?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.originalError = options?.originalError;
    this.context = options?.context;
  }
}

/** 缓存记录 */
export interface KlineCacheRecord {
  key: string;
  symbol: string;
  market: Market;
  interval: Interval;
  fetchedAt: number;
  stepSec: number;
  floorTime: number;
  complete: boolean;
  count: number;
  times: Int32Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
}

/** 元数据 */
export interface KlineCacheMeta {
  stepSec: number;
  floorTime: number;
  complete: boolean;
}

/** 缓存统计 */
export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  hitRate: number;
  latestEntry?: {
    key: string;
    fetchedAt: number;
  };
}

/** 流名称映射表 */
export const STREAM_NAMES: Record<Interval, string> = {
  '1s': '1s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w',
  '1M': '1M',
};

/** Binance API 路径模板 */
export const BINANCE_PATHS = {
  spot: {
    klines: '/api/v3/klines',
    ticker: '/api/v3/ticker/24hr',
    depth: '/api/v3/depth',
    trade: '/api/v3/trades',
    aggTrades: '/api/v3/aggTrades',
    exchangeInfo: '/api/v3/exchangeInfo',
  },
  future: {
    klines: '/fapi/v1/klines',
    ticker: '/fapi/v1/ticker/24hr',
    depth: '/fapi/v1/depth',
    trade: '/fapi/v1/trades',
    aggTrades: '/fapi/v1/aggTrades',
    exchangeInfo: '/fapi/v1/exchangeInfo',
    premiumIndex: '/fapi/v1/premiumIndex',
  },
};

/** WebSocket 流格式 */
export function getStreamName(symbol: string, interval?: Interval): string {
  const stream = symbol.toLowerCase();
  if (interval) {
    return `${stream}@kline_${STREAM_NAMES[interval]}`;
  }
  return stream;
}

/** 多条流合并 */
export function getMultiStream(symbols: string[], interval?: Interval): string[] {
  return symbols.map((s) => getStreamName(s, interval));
}
