/**
 * Kline Cache Utilities
 * 
 * K 线数据的二进制编码/解码工具
 * 使用 TypedArrays 存储以节省空间
 */

import type { Candle } from './types';

/**
 * 将 Candle 数组编码为二进制格式
 * 
 * @param bars - K 线数据数组
 * @returns 包含所有字段的二进制记录
 */
export function encodeBars(bars: Candle[]): Pick<
  { count: number; times: Int32Array; opens: Float64Array; highs: Float64Array; lows: Float64Array; closes: Float64Array; volumes: Float64Array }
> {
  const n = bars.length;
  
  // 分配 TypedArrays
  const times = new Int32Array(n);      // 4 bytes per bar -> 400KB for 100k bars
  const opens = new Float64Array(n);    // 8 bytes per bar
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const closes = new Float64Array(n);
  const volumes = new Float64Array(n);
  
  // 填充数据
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    times[i] = b.time;                 // Unix timestamp (seconds)
    opens[i] = b.open;
    highs[i] = b.high;
    lows[i] = b.low;
    closes[i] = b.close;
    volumes[i] = b.volume;
  }
  
  return {
    count: n,
    times,
    opens,
    highs,
    lows,
    closes,
    volumes,
  };
}

/**
 * 从二进制记录解码为 Candle 数组
 * 
 * @param rec - 缓存记录
 * @returns 解码后的 K 线数据
 */
export function decodeBars(rec: {
  count: number;
  times: Int32Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
}): Candle[] {
  const n = Math.min(rec.count, rec.times.length);
  const out: Candle[] = new Array(n);
  
  for (let i = 0; i < n; i++) {
    out[i] = {
      time: rec.times[i],
      open: rec.opens[i],
      high: rec.highs[i],
      low: rec.lows[i],
      close: rec.closes[i],
      volume: rec.volumes[i],
    };
  }
  
  return out;
}

/**
 * 计算编码后的大小（字节）
 */
export function calculateSize(bars: Candle[]): number {
  const n = bars.length;
  const overhead = 20; // Object header + other metadata
  
  return (
    overhead +
    n * (4 + 8 + 8 + 8 + 8 + 8) // time + OHLCV
  );
}

/**
 * 验证二进制记录的完整性
 */
export function isValidRecord(rec: unknown): boolean {
  if (!rec || typeof rec !== 'object') return false;
  
  const r = rec as Record<string, any>;
  
  // 必需字段检查
  if (
    !('count' in r) ||
    !('times' in r) ||
    !('opens' in r) ||
    !('closes' in r)
  ) {
    return false;
  }
  
  // 类型检查
  if (
    !(r.times instanceof Int32Array) ||
    !(r.opens instanceof Float64Array) ||
    !(r.closes instanceof Float64Array)
  ) {
    return false;
  }
  
  // 长度一致性检查
  if (r.count !== r.times.length || r.count !== r.opens.length || r.count !== r.closes.length) {
    return false;
  }
  
  return true;
}

/**
 * 压缩缓存（移除冗余字段）
 */
export function compressRecord(
  rec: Partial<KlineCacheRecord>,
  full: boolean = false
): Partial<KlineCacheRecord> {
  const compressed: Partial<KlineCacheRecord> = {};
  
  if (full) {
    // Full record
    Object.assign(compressed, rec);
  } else {
    // Minimal record (metadata only)
    const r = rec as Required<Pick<KlineCacheRecord, 'key' | 'symbol' | 'market' | 'interval'>> &
                Partial<Omit<KlineCacheRecord, 'key' | 'symbol' | 'market' | 'interval'>>;
    
    compressed.key = r.key;
    compressed.symbol = r.symbol;
    compressed.market = r.market;
    compressed.interval = r.interval;
    compressed.fetchedAt = r.fetchedAt;
    compressed.stepSec = r.stepSec;
    compressed.floorTime = r.floorTime;
    compressed.complete = r.complete ?? false;
    compressed.count = r.count ?? 0;
  }
  
  return compressed;
}

/**
 * 合并多个缓存记录
 */
export function mergeRecords(
  primary: KlineCacheRecord,
  secondary: KlineCacheRecord
): KlineCacheRecord | null {
  const primaryBars = decodeBars(primary);
  const secondaryBars = decodeBars(secondary);
  
  if (!primaryBars.length) return secondary;
  if (!secondaryBars.length) return primary;
  
  // 按时间排序并合并
  const allBars = [...primaryBars, ...secondaryBars].sort((a, b) => a.time - b.time);
  
  // 去重（相同时间的只保留最新一条）
  const unique = new Map<number, Candle>();
  for (const bar of allBars) {
    unique.set(bar.time, bar);
  }
  
  const merged = Array.from(unique.values()).sort((a, b) => a.time - b.time);
  
  try {
    return {
      key: `${primary.key}_merged`,
      symbol: primary.symbol,
      market: primary.market,
      interval: primary.interval,
      fetchedAt: Date.now(),
      ...encodeBars(merged),
      stepSec: primary.stepSec,
      floorTime: Math.min(primary.floorTime, secondary.floorTime),
      complete: primary.complete && secondary.complete,
    };
  } catch {
    return null;
  }
}

/**
 * 截断记录到指定数量
 */
export function truncateRecord(
  rec: KlineCacheRecord,
  maxCount: number
): KlineCacheRecord | null {
  const bars = decodeBars(rec);
  if (bars.length <= maxCount) return rec;
  
  // 保留最近的 maxCount 条
  const truncated = bars.slice(-maxCount);
  
  try {
    return {
      ...rec,
      count: truncated.length,
      ...encodeBars(truncated),
    };
  } catch {
    return null;
  }
}

/**
 * 扩展记录（如果已存在）
 */
export function expandRecordIfNeeded(
  existing: KlineCacheRecord,
  newData: Candle[],
  minGap: number = 100 // 最小间隙（根数），避免频繁更新
): KlineCacheRecord | null {
  const existingBars = decodeBars(existing);
  const lastExisting = existingBars[existingBars.length - 1];
  
  if (!lastExisting) {
    return encodeNewRecord(newData);
  }
  
  const gap = newData[0]?.time ? lastExisting.time - newData[0].time : 0;
  if (gap > 0 && gap < minGap) {
    return null; // Gap too small, don't update
  }
  
  try {
    const allBars = [...newData, ...existingBars].sort((a, b) => a.time - b.time);
    const merged = existingBars.slice();
    
    // 简单追加逻辑（假设新数据在开头）
    const newStartIndex = allBars.findIndex(b => b.time === newData[0]?.time);
    if (newStartIndex === -1) {
      return existing;
    }
    
    const beforeCut = newStartIndex;
    const truncated = allBars.slice(beforeCut).slice(-existing.count);
    
    return {
      ...existing,
      fetchedAt: Date.now(),
      ...encodeBars(truncated),
    };
  } catch {
    return null;
  }
}

/**
 * 编码为新记录
 */
function encodeNewRecord(bars: Candle[]): KlineCacheRecord | null {
  try {
    return {
      key: `unknown:${Date.now()}`,
      symbol: 'UNKNOWN',
      market: 'spot',
      interval: '15m',
      fetchedAt: Date.now(),
      stepSec: 60 * 15,
      floorTime: 0,
      complete: false,
      ...encodeBars(bars),
    };
  } catch {
    return null;
  }
}

/**
 * 序列化记录为 JSON（用于调试）
 */
export function serializeForDebug(rec: KlineCacheRecord): string {
  return JSON.stringify({
    key: rec.key,
    symbol: rec.symbol,
    market: rec.market,
    interval: rec.interval,
    count: rec.count,
    fetchedAt: rec.fetchedAt,
    firstBar: decodeBars(rec)[0],
    lastBar: decodeBars(rec)[decodeBars(rec).length - 1],
  }, null, 2);
}
