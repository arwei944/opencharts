/**
 * Data Aggregator
 * 
 * 统一的数据供应接口，整合 REST API、WebSocket 和缓存系统
 * 提供三层数据获取策略：Cache → REST API → Real-time WebSocket
 */

import { RestApiManager } from './rest-api';
import { WebSocketManager } from './websocket-manager';
import { CacheManager } from './cache-manager';
import type {
  Market,
  Candle,
  Ticker,
  OrderBook,
  SearchSuggestion,
  KlineParams,
  DataProviderOptions,
  DataProvider,
  DataError,
  DataErrorCode,
} from './types';
import { getStreamName, DEFAULT_REST_CONFIG, DEFAULT_WS_CONFIG, DEFAULT_CACHE_CONFIG } from './index';

// 默认历史数据量
const DEFAULT_BAR_COUNT = 1000;

export class DataAggregator implements DataProvider {
  private rest: RestApiManager;
  private ws: WebSocketManager;
  private cache: CacheManager;
  private options: Required<DataProviderOptions>;
  
  // 实时订阅管理
  private liveSubscriptions = new Map<string, { stream: string; callback: (bar: Candle) => void }[]>();
  
  // 最近一条 tick（用于增量更新）
  private lastTick = new Map<string, Candle>();
  
  constructor(options?: DataProviderOptions) {
    this.options = {
      enableCache: true,
      cacheConfig: DEFAULT_CACHE_CONFIG,
      fallbackToMock: false,
      mockDataGenerator: defaultMockDataGenerator,
      ...options,
    };
    
    // 初始化各个管理器
    this.rest = new RestApiManager(this.options.restApiConfig ?? DEFAULT_REST_CONFIG);
    this.ws = new WebSocketManager(this.options.wsConfig ?? DEFAULT_WS_CONFIG);
    this.cache = new CacheManager(this.options.cacheConfig ?? DEFAULT_CACHE_CONFIG);
    
    // 启动后台缓存预加载（可选）
    if (this.options.enableCache) {
      this.startBackgroundPrefetch();
    }
  }
  
  /**
   * 获取历史 K 线数据（主接口）
   */
  async getBars(
    symbol: string,
    market: Market,
    interval: Interval,
    count: number = DEFAULT_BAR_COUNT
  ): Promise<Candle[]> {
    const key = this.makeKey(symbol, market, interval);
    let bars: Candle[] = [];
    
    // Step 1: 尝试从缓存读取
    if (this.options.enableCache) {
      try {
        const cached = await this.cache.read(key);
        if (cached && cached.count > 0) {
          bars = this.cache.decode(cached);
          console.log(`[DataAggregator] Cache hit for ${key}: ${bars.length} bars`);
          
          // Step 2: 如果缓存不足，补充 REST API
          if (bars.length < count) {
            try {
              const restBars = await this.rest.fetchKlines({
                symbol,
                market,
                interval,
                limit: count - bars.length,
              });
              
              // 合并数据（去重 + 排序）
              bars = this.mergeBars([...restBars, ...bars]);
            } catch (error) {
              console.warn('[DataAggregator] REST API fallback failed:', error);
            }
          }
        }
      } catch (error) {
        console.error('[DataAggregator] Cache read failed:', error);
      }
    }
    
    // Step 3: 缓存缺失，直接调用 REST API
    if (bars.length === 0 || bars.length < count) {
      try {
        bars = await this.rest.fetchKlines({
          symbol,
          market,
          interval,
          limit: count,
        });
      } catch (error) {
        // Step 4: REST API 失败，使用模拟数据（仅开发环境）
        if (this.options.fallbackToMock) {
          console.warn('[DataAggregator] Falling back to mock data');
          bars = this.options.mockDataGenerator!({ symbol, market, interval });
        } else {
          throw new DataError(
            `Failed to fetch data for ${symbol}`,
            DataErrorCode.EMPTY_DATA,
            { originalError: error as Error }
          );
        }
      }
    }
    
    // Step 5: 写入缓存（批量写优化）
    if (this.options.enableCache && bars.length > 0) {
      const stepSec = this.getIntervalSeconds(interval);
      const floorTime = bars[bars.length - 1]?.time ?? 0;
      
      // 异步写入，不阻塞返回
      this.cache.write(key, { symbol, market, interval }, {
        stepSec,
        floorTime,
        complete: bars.length >= count,
      }, bars).catch(console.error);
    }
    
    return bars.slice(-count);
  }
  
  /**
   * 订阅实时 tick
   */
  subscribeTick(
    symbol: string,
    market: Market,
    callback: (tick: Candle) => void
  ): () => void {
    const interval = '1m'; // 默认订阅 1 分钟 K 线
    
    // 生成唯一 stream 名称
    const stream = getStreamName(symbol, interval as any);
    
    // 存储回调
    if (!this.liveSubscriptions.has(stream)) {
      this.liveSubscriptions.set(stream, []);
    }
    this.liveSubscriptions.get(stream)!.push({ stream, callback });
    
    // 如果尚未连接 WebSocket，立即连接
    if (!this.ws.isConnected()) {
      this.ws.connect().catch(console.error);
    }
    
    // 订阅流
    this.ws.subscribeKline(symbol, interval, (kline) => {
      // 传递给所有订阅者
      this.liveSubscriptions.get(stream)?.forEach((sub) => {
        try {
          sub.callback(kline);
        } catch (error) {
          console.error('[DataAggregator] Callback error:', error);
        }
      });
      
      // 保存最新 tick（用于增量更新）
      this.lastTick.set(stream, kline);
      
      // 更新缓存（增量更新最近一条）
      this.updateLatestBar(key, kline);
    });
    
    // 返回取消订阅函数
    return () => this.unsubscribeTick(symbol, stream);
  }
  
  /**
   * 取消订阅
   */
  unsubscribeTick(symbol: string, stream: string): void {
    const subs = this.liveSubscriptions.get(stream);
    if (subs) {
      // 移除当前回调（简化处理，实际应该传递回调引用）
      this.liveSubscriptions.delete(stream);
      
      // 如果所有订阅都移除，取消 WebSocket 订阅
      if (this.liveSubscriptions.size === 0) {
        this.ws.disconnect();
      }
    }
  }
  
  /**
   * 获取 ticker 信息
   */
  async getTicker(symbol: string, market: Market): Promise<Ticker | null> {
    try {
      return await this.rest.fetchTicker(symbol, market);
    } catch (error) {
      console.error('[DataAggregator] Fetch ticker failed:', error);
      return null;
    }
  }
  
  /**
   * 获取订单簿
   */
  async getOrderBook(symbol: string, market: Market, depth: number = 20): Promise<OrderBook | null> {
    try {
      return await this.rest.fetchDepth(symbol, market, depth);
    } catch (error) {
      console.error('[DataAggregator] Fetch orderbook failed:', error);
      return null;
    }
  }
  
  /**
   * 搜索交易对
   */
  async searchSymbols(query: string, market: Market, limit: number = 40): Promise<SearchSuggestion[]> {
    try {
      return await this.rest.searchSymbols(query, market, limit);
    } catch (error) {
      console.error('[DataAggregator] Search symbols failed:', error);
      return [];
    }
  }
  
  /**
   * 清理所有连接和缓存
   */
  async disconnect(): Promise<void> {
    this.ws.disconnect();
    this.cache.disconnect();
    
    // 清除所有订阅
    this.liveSubscriptions.clear();
    this.lastTick.clear();
  }
  
  /**
   * 生成缓存键
   */
  private makeKey(symbol: string, market: Market, interval: string): string {
    return `${market}:${symbol}:${interval}`;
  }
  
  /**
   * 获取周期对应的秒数
   */
  private getIntervalSeconds(interval: string): number {
    const secondsMap: Record<string, number> = {
      '1s': 1,
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '6h': 21600,
      '8h': 28800,
      '12h': 43200,
      '1d': 86400,
      '3d': 259200,
      '1w': 604800,
      '1M': 2592000,
    };
    return secondsMap[interval] || 60;
  }
  
  /**
   * 合并 K 线数据（去重 + 排序）
   */
  private mergeBars(bars: Candle[]): Candle[] {
    // 按时间排序
    bars.sort((a, b) => a.time - b.time);
    
    // 按时间去重（保留最新）
    const unique = new Map<number, Candle>();
    for (const bar of bars) {
      unique.set(bar.time, bar);
    }
    
    return Array.from(unique.values()).sort((a, b) => a.time - b.time);
  }
  
  /**
   * 更新最新 K 线（增量更新）
   */
  private async updateLatestBar(key: string, newBar: Candle): Promise<void> {
    if (!this.options.enableCache) return;
    
    try {
      const cached = await this.cache.read(key);
      if (!cached) return;
      
      const bars = this.cache.decode(cached);
      if (bars.length === 0) return;
      
      const lastBar = bars[bars.length - 1];
      
      // 如果新条包含相同时间，更新该条
      if (newBar.time === lastBar.time) {
        bars[bars.length - 1] = newBar;
        
        await this.cache.write(key, {
          symbol: cached.symbol,
          market: cached.market,
          interval: cached.interval,
        }, {
          stepSec: cached.stepSec,
          floorTime: cached.floorTime,
          complete: cached.complete,
        }, bars);
        
        console.log(`[DataAggregator] Updated latest bar for ${key}`);
      }
    } catch (error) {
      console.error('[DataAggregator] Update latest bar failed:', error);
    }
  }
  
  /**
   * 启动后台预加载（可选）
   */
  private startBackgroundPrefetch(): void {
    // 定时刷新最近的热门标的
    const hotSymbols = ['BTCUSDT', 'ETHUSDT'];
    const intervals = ['15m', '1h', '4h'];
    
    setInterval(async () => {
      for (const symbol of hotSymbols) {
        for (const interval of intervals) {
          try {
            const bars = await this.getBars(symbol, 'spot', interval, 500);
            console.log(`[DataAggregator] Background prefetch ${symbol}/${interval}: ${bars.length} bars`);
          } catch {
            // Ignore errors in background
          }
        }
      }
    }, 5 * 60 * 1000); // 每 5 分钟
  }
}

/**
 * 默认的 Mock 数据生成器
 */
function defaultMockDataGenerator(params: { symbol: string; market: Market; interval: string }): Candle[] {
  const bars: Candle[] = [];
  let time = Math.floor(Date.now() / 1000) - 1000 * 3600; // 倒退 1000 小时
  const basePrice = params.symbol.includes('BTC') ? 50000 : 2000;
  
  for (let i = 0; i < 1000; i++) {
    const volatility = basePrice * 0.02; // 2%
    const open = basePrice + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    
    bars.push({
      time,
      open,
      high: Math.max(open, close) + Math.random() * volatility * 0.5,
      low: Math.min(open, close) - Math.random() * volatility * 0.5,
      close,
      volume: Math.random() * 1000,
    });
    
    time += 60 * 15; // 15 分钟
  }
  
  return bars.reverse();
}

/**
 * 创建预设的完整数据供应器（Binance）
 */
export function createBinanceDataProvider(options?: DataProviderOptions): DataProvider {
  return new DataAggregator(options);
}

/**
 * 创建轻量级数据供应器（仅缓存 + 模拟）
 */
export function createLightDataProvider(options?: Omit<Partial<DataProviderOptions>, 'restApiConfig'>): DataProvider {
  return new DataAggregator({
    restApiConfig: undefined, // 禁用 REST API
    fallbackToMock: true,
    ...options,
  });
}
