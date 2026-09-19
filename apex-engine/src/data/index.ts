/**
 * ApexChart Data Layer - Main Entry
 * 
 * 统一的数据供应接口，整合 REST API、WebSocket 和缓存系统
 */

export { RestApiManager, createDefaultRestApi, DEFAULT_REST_CONFIG } from './rest-api';
export { WebSocketManager, createDefaultWsManager, DEFAULT_WS_CONFIG } from './websocket-manager';
export { CacheManager, createDefaultCacheManager, getDefaultCache, DEFAULT_CACHE_CONFIG } from './cache-manager';
export { DataAggregator, createBinanceDataProvider, createLightDataProvider } from './data-aggregator';
export { encodeBars, decodeBars, isValidRecord, compressRecord, mergeRecords, truncateRecord, expandRecordIfNeeded, serializeForDebug } from './kline-cache';

export type {
  Market,
  Interval,
  Candle,
  Ticker,
  OrderBook,
  BookLevel,
  Trade,
  WatchItem,
  PremiumIndex,
  SearchSuggestion,
  KlineParams,
  RestApiConfig,
  WebSocketConfig,
  CacheConfig,
  DataProviderOptions,
  DataProvider,
} from './types';

export { DataError, DataErrorCode } from './types';
export { STREAM_NAMES, BINANCE_PATHS, getStreamName, getMultiStream } from './types';
