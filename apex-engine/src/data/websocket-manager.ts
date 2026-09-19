/**
 * WebSocket Manager
 * 
 * 负责建立和维护与交易所的实时连接
 * 特性:
 * - 自动重连机制
 * - 心跳保活
 * - 订阅/取消订阅管理
 * - 消息解析和分发
 */

import type {
  Market,
  Candle,
  Trade,
  Ticker,
  WebSocketConfig,
  DataError,
  DataErrorCode,
} from './types';
import { getStreamName, getMultiStream } from './types';

export interface StreamMessage {
  stream: string;
  data: unknown;
}

export class WebSocketManager {
  private config: Required<WebSocketConfig>;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<(data: unknown) => void>> = new Map();
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTime: number = 0;
  
  constructor(config: WebSocketConfig) {
    this.config = {
      spotUrl: 'wss://stream.binance.com:9443/ws',
      futureUrl: 'wss://fstream.binance.com/ws',
      heartbeatMs: 30000,
      reconnectDelayMs: 2000,
      maxReconnectAttempts: 10,
      ...config,
    };
    
    this.setupHeartbeat();
  }
  
  /**
   * 获取当前市场的 WebSocket URL
   */
  private getUrl(market: Market): string {
    return market === 'usdm' ? this.config.futureUrl : this.config.spotUrl;
  }
  
  /**
   * 建立 WebSocket 连接
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.getUrl('spot'); // Always connect to spot first for multi-stream
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.reconnectAttempts = 0;
          resolve();
          this.startSubscriptions();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          reject(new DataError(
            'WebSocket error',
            DataErrorCode.WS_ERROR,
            { originalError: error as Error }
          ));
        };
        
        this.ws.onclose = (event) => {
          console.log(`[WS] Closed: code=${event.code}, reason=${event.reason}`);
          this.ws = null;
          this.scheduleReconnect();
        };
      } catch (error) {
        reject(new DataError(
          'Failed to create WebSocket',
          DataErrorCode.WS_ERROR,
          { originalError: error as Error }
        ));
      }
    });
  }
  
  /**
   * 处理接收到的消息
   */
  private handleMessage(rawData: string): void {
    try {
      const data = JSON.parse(rawData);
      
      // Handle subscription acknowledgment
      if (data.e === 'SUBSCRIBED') {
        console.log('[WS] Subscription confirmed:', data.subId);
        return;
      }
      
      // Handle ping from server (response to pong)
      if (data.e === 'PING') {
        this.sendPong();
        return;
      }
      
      // Handle regular K line updates
      if (data.e === 'kline') {
        const kline = this.parseKline(data.k);
        if (kline) {
          this.dispatchToSubscribers(kline.stream, kline.data);
        }
        return;
      }
      
      // Handle agg trade updates
      if (data.e === 'aggTrade') {
        const trade = this.parseTrade(data);
        this.dispatchToSubscribers(data.s, { type: 'trade', data: trade });
        return;
      }
      
      // Handle ticker updates
      if (data.e === '24hrTicker') {
        const ticker = this.parseTicker(data);
        this.dispatchToSubscribers(data.symbol, { type: 'ticker', data: ticker });
        return;
      }
      
      // Handle generic message with stream field
      if ('stream' in data && 'data' in data) {
        this.dispatchToSubscribers(data.stream, data.data);
        return;
      }
      
      // Fallback: try to parse as K line
      if ('s' in data && 'k' in data) {
        const kline = this.parseKline(data.k as any);
        if (kline) {
          this.dispatchToSubscribers(kline.stream, kline.data);
        }
      }
    } catch (error) {
      console.error('[WS] Message parse error:', error);
    }
  }
  
  /**
   * 解析 K 线消息
   */
  private parseKline(k: unknown): StreamMessage | null {
    if (!k || typeof k !== 'object') return null;
    
    const raw = k as Record<string, unknown>;
    const klineData = raw as {
      t: number;
      o: string;
      h: string;
      l: string;
      c: string;
      v: string;
      i: string;
    };
    
    return {
      stream: `${raw.s as string}@${klineData.i as string}`,
      data: {
        time: Math.floor(klineData.t / 1000),
        open: Number(klineData.o),
        high: Number(klineData.h),
        low: Number(klineData.l),
        close: Number(klineData.c),
        volume: Number(klineData.v),
      },
    };
  }
  
  /**
   * 解析成交数据
   */
  private parseTrade(raw: unknown): Trade {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid trade format');
    
    const t = raw as Record<string, unknown>;
    return {
      id: Number(t.t ?? 0),
      price: Number(t.p ?? 0),
      qty: Number(t.q ?? 0),
      isBuyerMaker: Boolean(t.m ?? false),
      time: Math.floor(Number(t.T ?? 0) / 1000),
    };
  }
  
  /**
   * 解析 ticker 数据
   */
  private parseTicker(raw: unknown): Ticker {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid ticker format');
    
    const t = raw as Record<string, unknown>;
    return {
      symbol: t.s as string,
      last: Number(t.c ?? 0),
      open: Number(t.o ?? 0),
      high: Number(t.h ?? 0),
      low: Number(t.l ?? 0),
      volume: Number(t.v ?? 0),
      quoteVolume: Number(t.q ?? 0),
      change: Number(t.P ?? 0),
      changePct: Number(t.p ?? 0),
    };
  }
  
  /**
   * 分发消息给所有订阅者
   */
  private dispatchToSubscribers(stream: string, data: unknown): void {
    const subscribers = this.subscriptions.get(stream);
    if (subscribers) {
      subscribers.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('[WS] Callback error:', error);
        }
      });
    }
  }
  
  /**
   * 启动已注册的订阅
   */
  private startSubscriptions(): void {
    for (const [stream, callbacks] of this.subscriptions.entries()) {
      this.sendRequest({
        method: 'SUBSCRIBE',
        params: [stream],
      });
    }
  }
  
  /**
   * 发送 WebSocket 请求
   */
  private sendRequest(request: { method: string; params: string[]; subId?: string }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send request: not connected');
      return;
    }
    
    request.subId = `req-${Date.now()}`;
    this.ws.send(JSON.stringify(request));
  }
  
  /**
   * 发送心跳（ping）
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.lastPingTime = Date.now();
    this.ws.send(JSON.stringify({ method: 'PING' }));
  }
  
  /**
   * 回复心跳（pong）
   */
  private sendPong(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const pongTime = Date.now();
    const latency = pongTime - this.lastPingTime;
    console.log(`[WS] PONG - latency: ${latency}ms`);
  }
  
  /**
   * 设置心跳定时器
   */
  private setupHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.config.heartbeatMs);
  }
  
  /**
   * 计划重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.error('[WS] Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs! * this.reconnectAttempts;
    
    console.log(`[WS] Scheduling reconnect #${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }
  
  /**
   * 订阅流
   */
  subscribe(
    streams: string[],
    callbacks: Array<(data: unknown) => void>
  ): void {
    streams.forEach((stream, index) => {
      if (!this.subscriptions.has(stream)) {
        this.subscriptions.set(stream, new Set());
      }
      this.subscriptions.get(stream)!.add(callbacks[index]);
    });
    
    // If connected, immediately send subscription request
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      streams.forEach((stream) => {
        this.sendRequest({
          method: 'SUBSCRIBE',
          params: [stream],
        });
      });
    }
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(streams: string[]): void {
    streams.forEach((stream) => {
      this.subscriptions.delete(stream);
    });
    
    // If connected, send unsubscription request
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRequest({
        method: 'UNSUBSCRIBE',
        params: streams,
      });
    }
  }
  
  /**
   * 订阅实时 K 线
   */
  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Candle) => void
  ): () => void {
    const stream = getStreamName(symbol, interval as any);
    this.subscribe([stream], [callback]);
    
    return () => this.unsubscribe([stream]);
  }
  
  /**
   * 订阅实时成交
   */
  subscribeAggTrades(
    symbol: string,
    callback: (trade: Trade) => void
  ): () => void {
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    this.subscribe([stream], [callback]);
    
    return () => this.unsubscribe([stream]);
  }
  
  /**
   * 订阅 24 小时行情
   */
  subscribeTicker(
    symbol: string,
    callback: (ticker: Ticker) => void
  ): () => void {
    const stream = `${symbol.toLowerCase()}@ticker`;
    this.subscribe([stream], [callback]);
    
    return () => this.unsubscribe([stream]);
  }
  
  /**
   * 断开连接
   */
  disconnect(): void {
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Unsubscribe all');
      this.ws = null;
    }
    
    // Clear subscriptions
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * 获取订阅数量
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

// 默认配置
export const DEFAULT_WS_CONFIG: WebSocketConfig = {
  spotUrl: 'wss://stream.binance.com:9443/ws',
  futureUrl: 'wss://fstream.binance.com/ws',
  heartbeatMs: 30000,
  reconnectDelayMs: 2000,
  maxReconnectAttempts: 10,
};

/**
 * 创建默认的 WebSocket 管理器
 */
export function createDefaultWsManager(): WebSocketManager {
  return new WebSocketManager(DEFAULT_WS_CONFIG);
}
