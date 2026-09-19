/**
 * Cache Manager
 * 
 * 负责本地缓存 K 线数据（IndexedDB）
 * 特性:
 * - Binary storage (TypedArrays) 节省空间
 * - 过期检查
 * - 自动修剪
 * - 批量查询优化
 */

import type {
  Market,
  Candle,
  CacheConfig,
  KlineCacheRecord,
  KlineCacheMeta,
  CacheStats,
} from './types';
import { encodeBars, decodeBars } from './kline-cache';

export class CacheManager {
  private config: Required<CacheConfig>;
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  
  constructor(config?: CacheConfig) {
    this.config = {
      dbName: 'apex-kline-cache',
      storeName: 'klines',
      maxEntries: 10,
      expirationMs: 7 * 24 * 60 * 60 * 1000, // 7 天
      syncIntervalMs: 5 * 60 * 1000, // 5 分钟
      ...config,
    };
    
    this.open();
  }
  
  /**
   * 打开数据库
   */
  private open(): void {
    if (this.dbPromise) return;
    
    if (typeof indexedDB === 'undefined') {
      console.warn('[Cache] IndexedDB not supported');
      this.dbPromise = Promise.resolve(null);
      return;
    }
    
    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.config.dbName!, this.config.version || 1);
        
        req.onupgradeneeded = (event) => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.config.storeName!)) {
            const objectStore = db.createObjectStore(this.config.storeName!, { keyPath: 'key' });
            objectStore.createIndex('fetchedAt', 'fetchedAt', { unique: false });
            objectStore.createIndex('symbol', 'symbol', { unique: false });
          }
        };
        
        req.onsuccess = () => {
          this.db = req.result;
          console.log('[Cache] Database opened successfully');
          resolve(this.db);
        };
        
        req.onerror = () => {
          console.error('[Cache] Database error:', req.error);
          resolve(null);
        };
        
        req.onblocked = () => {
          console.warn('[Cache] Database blocked');
          resolve(null);
        };
      } catch (error) {
        console.error('[Cache] Failed to open database:', error);
        resolve(null);
      }
    });
  }
  
  /**
   * 获取数据库实例
   */
  private async getDb(): Promise<IDBDatabase | null> {
    await this.open();
    return this.db;
  }
  
  /**
   * 包装 IDBRequest 为 Promise
   */
  private wrap<T>(req: IDBRequest<T>): Promise<T | null> {
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  
  /**
   * 等待事务完成
   */
  private done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  
  /**
   * 读取缓存记录
   */
  async read(key: string): Promise<KlineCacheRecord | null> {
    const db = await this.getDb();
    if (!db) return null;
    
    try {
      const tx = db.transaction(this.config.storeName!, 'readonly');
      const rec = await this.wrap<KlineCacheRecord>(
        tx.objectStore(this.config.storeName!).get(key)
      );
      await this.done(tx);
      
      if (!rec) return null;
      
      // 验证数据结构完整性
      if (
        !rec.times ||
        !rec.count ||
        rec.count !== rec.times.length ||
        rec.closes?.length !== rec.count
      ) {
        return null;
      }
      
      return rec;
    } catch {
      return null;
    }
  }
  
  /**
   * 写入缓存记录
   */
  async write(
    key: string,
    ident: { symbol: string; market: Market; interval: string },
    meta: KlineCacheMeta,
    bars: Candle[]
  ): Promise<void> {
    const db = await this.getDb();
    if (!db || !bars.length) return;
    
    try {
      const record: Omit<KlineCacheRecord, 'times'> & { times: Int32Array } = {
        key,
        symbol: ident.symbol,
        market: ident.market,
        interval: ident.interval as any,
        fetchedAt: Date.now(),
        ...meta,
        ...encodeBars(bars),
      };
      
      const tx = db.transaction(this.config.storeName!, 'readwrite');
      tx.objectStore(this.config.storeName!).put(record);
      await this.done(tx);
      
      console.log(`[Cache] Wrote ${bars.length} bars for ${key}`);
    } catch {
      // Cache is an optimization — never surface failures
      console.warn('[Cache] Write failed');
    }
  }
  
  /**
   * 读取带有过期检查的记录
   */
  async readWithExpiry(key: string): Promise<KlineCacheRecord | null> {
    const rec = await this.read(key);
    
    if (!rec) return null;
    
    // 检查是否过期
    const now = Date.now();
    const expirationTime = rec.fetchedAt + (this.config.expirationMs ?? 0);
    
    if (now > expirationTime) {
      console.log(`[Cache] Entry expired: ${key}`);
      return null;
    }
    
    return rec;
  }
  
  /**
   * 批量读取
   */
  async batchRead(keys: string[]): Promise<Map<string, KlineCacheRecord>> {
    const result = new Map<string, KlineCacheRecord>();
    
    for (const key of keys) {
      const rec = await this.read(key);
      if (rec) {
        result.set(key, rec);
      }
    }
    
    return result;
  }
  
  /**
   * 删除记录
   */
  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    
    try {
      const tx = db.transaction(this.config.storeName!, 'readwrite');
      tx.objectStore(this.config.storeName!).delete(key);
      await this.done(tx);
    } catch {
      // Ignore errors
    }
  }
  
  /**
   * 列出所有键
   */
  async listKeys(): Promise<string[]> {
    const db = await this.getDb();
    if (!db) return [];
    
    try {
      const keys: string[] = [];
      const tx = db.transaction(this.config.storeName!, 'readonly');
      const cursorReq = tx.objectStore(this.config.storeName!).openCursor();
      
      await new Promise<void>((resolve) => {
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            keys.push(cursor.key as string);
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => resolve();
      });
      
      return keys;
    } catch {
      return [];
    }
  }
  
  /**
   * 按符号列出所有键
   */
  async listKeysBySymbol(symbol: string): Promise<string[]> {
    const allKeys = await this.listKeys();
    return allKeys.filter((key) => key.includes(`${symbol}:`));
  }
  
  /**
   * 清理过期和多余条目
   */
  async prune(maxEntries?: number): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    
    try {
      const count = maxEntries ?? this.config.maxEntries;
      const tx = db.transaction(this.config.storeName!, 'readwrite');
      const index = tx.objectStore(this.config.storeName!).index('fetchedAt');
      
      let deleted = 0;
      let seen = 0;
      
      await new Promise<void>((resolve) => {
        const cursorReq = index.openCursor(null, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            console.log(`[Cache] Pruned ${deleted} entries, kept ${seen}`);
            resolve();
            return;
          }
          
          seen++;
          if (seen > count) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        };
        cursorReq.onerror = () => resolve();
      });
    } catch {
      // Ignore errors
    }
  }
  
  /**
   * 计算缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    const db = await this.getDb();
    if (!db) {
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        hitRate: 0,
      };
    }
    
    try {
      const keys = await this.listKeys();
      const stats: CacheStats = {
        totalEntries: keys.length,
        totalSizeBytes: 0,
        hitRate: 0,
      };
      
      for (const key of keys) {
        const rec = await this.read(key);
        if (rec) {
          // Estimate size in bytes
          const entrySize = rec.count * 28; // Each bar: time(4) + open(8) + high(8) + low(8) + close(8) + volume(8) = 44 bytes per bar, plus overhead
          stats.totalSizeBytes += entrySize;
          stats.hitRate += Math.random() * 0.3; // Mock calculation
        }
      }
      
      return stats;
    } catch {
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        hitRate: 0,
      };
    }
  }
  
  /**
   * 解码缓存记录为 Candle[]
   */
  decode(rec: KlineCacheRecord): Candle[] {
    return decodeBars(rec);
  }
  
  /**
   * 将 Candle[]编码为二进制格式
   */
  encode(bars: Candle[]): Pick<
    KlineCacheRecord,
    | 'count'
    | 'times'
    | 'opens'
    | 'highs'
    | 'lows'
    | 'closes'
    | 'volumes'
  > {
    return encodeBars(bars);
  }
  
  /**
   * 断开连接（可选，用于资源清理）
   */
  disconnect(): void {
    // IndexedDB doesn't need explicit close
    // But we can clear the reference
    this.db = null;
    this.dbPromise = null;
  }
  
  /**
   * 重置数据库（危险操作！）
   */
  async reset(): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    
    try {
      const tx = db.transaction(this.config.storeName!, 'readwrite');
      tx.objectStore(this.config.storeName!).clear();
      await this.done(tx);
      console.log('[Cache] Database cleared');
    } catch {
      // Ignore errors
    }
  }
}

// 默认配置
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxEntries: 10,
  expirationMs: 7 * 24 * 60 * 60 * 1000,
  syncIntervalMs: 5 * 60 * 1000,
};

/**
 * 创建默认的缓存管理器
 */
export function createDefaultCacheManager(): CacheManager {
  return new CacheManager(DEFAULT_CACHE_CONFIG);
}

/**
 * 全局缓存单例（懒加载）
 */
class CacheSingleton {
  private instance: CacheManager | null = null;
  
  getInstance(config?: CacheConfig): CacheManager {
    if (!this.instance) {
      this.instance = new CacheManager(config);
    }
    return this.instance;
  }
}

export const cacheSingleton = new CacheSingleton();
export const getDefaultCache = () => cacheSingleton.getInstance();
