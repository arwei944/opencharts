/**
 * REST API Manager
 * 
 * 负责从交易所 REST API 获取历史数据和实时行情
 * 特性：
 * - Host 故障自动切换
 * - Sticky Host 优化连接复用
 * - 请求超时保护
 * - 失败重试机制
 */

import type { 
  Market, 
  Candle, 
  Ticker, 
  OrderBook, 
  SearchSuggestion,
  KlineParams,
  RestApiConfig,
  DataError,
  DataErrorCode,
} from './types';
import { BINANCE_PATHS } from './types';

export class RestApiManager {
  private config: RestApiConfig;
  private stickyHosts: Record<Market, string | null> = { spot: null, usdm: null };
  
  constructor(config: RestApiConfig) {
    this.config = {
      timeoutMs: 8000,
      retryAttempts: 3,
      headers: { 'Accept': 'application/json' },
      ...config,
    };
  }
  
  /**
   * 获取当前可用的 host（带故障转移）
   */
  private getHost(market: Market): string | null {
    const hosts = market === 'usdm' ? this.config.futureHosts : this.config.spotHosts;
    
    // 优先使用粘性 host（如果存在）
    const stick = this.stickyHosts[market];
    if (stick && hosts.includes(stick)) {
      return stick;
    }
    
    // 否则返回第一个
    return hosts.length > 0 ? hosts[0] : null;
  }
  
  /**
   * 更新粘性 host
   */
  private setStickyHost(market: Market, host: string): void {
    this.stickyHosts[market] = host;
  }
  
  /**
   * 清除失败的 sticky host
   */
  private clearStickyHost(market: Market): void {
    if (this.stickyHosts[market]) {
      this.stickyHosts[market] = null;
    }
  }
  
  /**
   * 构建完整 URL
   */
  private buildUrl(market: Market, path: string, params: URLSearchParams): string {
    const host = this.getHost(market);
    if (!host) {
      throw new DataError(
        'No available host for market',
        DataErrorCode.NETWORK_ERROR,
        { market }
      );
    }
    return `${host}${path}${params.toString()}`;
  }
  
  /**
   * 执行 fetch 请求（带重试）
   */
  private async fetchWithRetry(
    url: string,
    signal: AbortSignal,
    attempt: number = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        signal,
        headers: this.config.headers,
      });
      
      if (response.ok) {
        return response;
      }
      
      // 4xx 错误不要重试
      if (response.status >= 400 && response.status < 500) {
        throw new DataError(
          `HTTP ${response.status}`,
          DataErrorCode.RATE_LIMIT,
          { url, status: response.status }
        );
      }
      
      throw new DataError(
        `Server error: ${response.status}`,
        DataErrorCode.NETWORK_ERROR,
        { url, status: response.status }
      );
    } catch (error) {
      if (error instanceof DataError) throw error;
      
      // 网络错误或服务器错误，尝试重试
      if (attempt < this.config.retryAttempts!) {
        const delay = Math.pow(2, attempt) * 1000; // 指数退避
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, signal, attempt + 1);
      }
      
      throw new DataError(
        `Network error after ${this.config.retryAttempts} attempts`,
        DataErrorCode.NETWORK_ERROR,
        { originalError: error as Error }
      );
    }
  }
  
  /**
   * 解析 K 线数据
   */
  private parseKlines(raw: unknown, market: Market): Candle[] {
    if (!Array.isArray(raw)) {
      throw new DataError(
        'Invalid klines format',
        DataErrorCode.INVALID_SYMBOL,
        { rawType: typeof raw }
      );
    }
    
    const isSpot = market === 'spot';
    const paths = BINANCE_PATHS[isSpot ? 'spot' : 'future'];
    const isLegacyFormat = raw.length > 0 && Array.isArray((raw as any)[0]);
    
    if (isLegacyFormat) {
      // Legacy array format: [time, open, high, low, close, volume, ...]
      return raw.map((k: unknown) => {
        const row = k as (string | number)[];
        return {
          time: Math.floor(Number(row[0]) / 1000),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
        };
      });
    } else {
      // Object format
      return raw.map((k: unknown) => {
        const obj = k as Record<string, unknown>;
        return {
          time: Math.floor((obj.closeTime || obj.T || 0) / 1000),
          open: Number(obj.open || obj.o || 0),
          high: Number(obj.high || obj.h || 0),
          low: Number(obj.low || obj.l || 0),
          close: Number(obj.close || obj.c || 0),
          volume: Number(obj.volume || obj.v || 0),
        };
      });
    }
  }
  
  /**
   * 解析 ticker 数据
   */
  private parseTicker(raw: unknown, symbol: string): Ticker {
    if (!raw || typeof raw !== 'object') {
      throw new DataError(
        'Invalid ticker format',
        DataErrorCode.INVALID_SYMBOL,
        { rawType: typeof raw }
      );
    }
    
    const t = raw as Record<string, string | number>;
    return {
      symbol,
      last: Number(t.lastPrice ?? t.c ?? 0),
      open: Number(t.openPrice ?? t.o ?? 0),
      high: Number(t.highPrice ?? t.h ?? 0),
      low: Number(t.lowPrice ?? t.l ?? 0),
      volume: Number(t.volume ?? t.v ?? 0),
      quoteVolume: Number(t.quoteVolume ?? t.q ?? 0),
      change: Number(t.priceChange ?? t.p ?? 0),
      changePct: Number(t.priceChangePercent ?? t.P ?? 0),
    };
  }
  
  /**
   * 解析订单簿数据
   */
  private parseOrderBook(raw: unknown): OrderBook {
    if (!raw || typeof raw !== 'object') {
      throw new DataError(
        'Invalid orderbook format',
        DataErrorCode.INVALID_SYMBOL
      );
    }
    
    const j = raw as { bids: string[][]; asks: string[][] };
    return {
      bids: (j.bids ?? []).map(([p, qv]) => ({
        price: Number(p),
        qty: Number(qv),
      })),
      asks: (j.asks ?? []).map(([p, qv]) => ({
        price: Number(p),
        qty: Number(qv),
      })),
    };
  }
  
  /**
   * 解析搜索建议
   */
  private parseSearchSuggestions(raw: unknown, market: Market): SearchSuggestion[] {
    if (!raw || typeof raw !== 'object') {
      return [];
    }
    
    const j = raw as { symbols: { symbol: string; status: string; baseAsset?: string; quoteAsset?: string }[] };
    const isFuture = market === 'usdm';
    
    return j.symbols
      .filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .slice(0, 40)
      .map((s) => ({
        symbol: s.symbol,
        type: isFuture ? 'future' : 'spot',
        baseAsset: s.baseAsset || '',
        quoteAsset: s.quoteAsset || '',
      }));
  }
  
  /**
   * 获取历史 K 线
   */
  async fetchKlines(params: KlineParams): Promise<Candle[]> {
    const { symbol, market, interval, startTime, endTime, limit = 1000 } = params;
    
    // 参数验证
    const validatedLimit = Math.min(Math.max(limit, 1), 1000);
    
    const paramsObj = new URLSearchParams({
      symbol,
      interval,
      limit: validatedLimit.toString(),
    });
    
    if (startTime) {
      paramsObj.set('startTime', startTime.toString());
    }
    if (endTime) {
      paramsObj.set('endTime', endTime.toString());
    }
    
    const isFuture = market === 'usdm';
    const path = BINANCE_PATHS[isFuture ? 'future' : 'spot'].klines;
    const url = this.buildUrl(market, path, paramsObj);
    
    let response: Response;
    let lastError: Error | null = null;
    
    // 尝试所有可用 hosts
    const hosts = isFuture ? this.config.futureHosts : this.config.spotHosts;
    for (const host of hosts) {
      try {
        const testUrl = `${host}${path}?${paramsObj.toString()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs!);
        
        try {
          response = await fetch(testUrl, {
            signal: controller.signal,
            headers: this.config.headers,
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            // 设置粘性 host
            this.setStickyHost(market, host);
            break;
          }
        } catch (err) {
          clearTimeout(timeoutId);
          lastError = err as Error;
        }
      } catch (err) {
        lastError = err as Error;
        continue;
      }
    }
    
    if (!response || !response.ok) {
      throw new DataError(
        `Failed to fetch klines from all hosts`,
        DataErrorCode.NETWORK_ERROR,
        { originalError: lastError || undefined, symbol, market }
      );
    }
    
    const raw = await response.json();
    return this.parseKlines(raw, market);
  }
  
  /**
   * 获取 ticker 信息
   */
  async fetchTicker(symbol: string, market: Market): Promise<Ticker | null> {
    try {
      const isFuture = market === 'usdm';
      const path = BINANCE_PATHS[isFuture ? 'future' : 'spot'].ticker;
      
      const paramsObj = new URLSearchParams({ symbol });
      const url = this.buildUrl(market, path, paramsObj);
      
      const response = await this.fetchWithRetry(url, AbortSignal.timeout(this.config.timeoutMs!));
      const raw = await response.json();
      
      // Handle both single object and array response
      const data = Array.isArray(raw) 
        ? raw.find((t: any) => t.symbol === symbol) 
        : raw;
      
      if (!data) {
        throw new DataError(
          'Symbol not found',
          DataErrorCode.INVALID_SYMBOL,
          { symbol }
        );
      }
      
      return this.parseTicker(data, symbol);
    } catch (error) {
      if (error instanceof DataError && error.code === DataErrorCode.INVALID_SYMBOL) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * 获取订单簿
   */
  async fetchDepth(symbol: string, market: Market, limit: number = 20): Promise<OrderBook> {
    const isFuture = market === 'usdm';
    const path = BINANCE_PATHS[isFuture ? 'future' : 'spot'].depth;
    
    const paramsObj = new URLSearchParams({
      symbol,
      limit: limit.toString(),
    });
    
    const url = this.buildUrl(market, path, paramsObj);
    const response = await this.fetchWithRetry(url, AbortSignal.timeout(this.config.timeoutMs!));
    const raw = await response.json();
    
    return this.parseOrderBook(raw);
  }
  
  /**
   * 搜索交易对
   */
  async searchSymbols(query: string, market: Market, limit: number = 40): Promise<SearchSuggestion[]> {
    const isFuture = market === 'usdm';
    const path = BINANCE_PATHS[isFuture ? 'future' : 'spot'].exchangeInfo;
    
    const url = this.buildUrl(market, path, new URLSearchParams());
    const response = await this.fetchWithRetry(url, AbortSignal.timeout(this.config.timeoutMs!));
    const raw = await response.json();
    
    const suggestions = this.parseSearchSuggestions(raw, market).filter(s => 
      s.symbol.includes(query.toUpperCase())
    );
    
    return suggestions.slice(0, limit);
  }
}

// 默认配置
export const DEFAULT_REST_CONFIG: RestApiConfig = {
  spotHosts: [
    'https://data-api.binance.vision',
    'https://api.binance.com',
    'https://api.binance.us',
  ],
  futureHosts: [
    'https://fapi.binance.com',
    'https://dapi.binance.com',
  ],
};

/**
 * 创建默认的 REST API 管理器
 */
export function createDefaultRestApi(): RestApiManager {
  return new RestApiManager(DEFAULT_REST_CONFIG);
}
