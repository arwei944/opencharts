/**
 * Built-in Indicator Plugins - 内置指标插件实现
 * 
 * 提供基础的技术指标作为插件示例
 */

import type { Candle, IndicatorPlugin } from "./types";
import { SMA, EMA, BollingerBands, RSI, MACD, KDJ, VolumeProfile } from "../lib/market/indicators";

// ============================================================================
// Simple Moving Average (MA)
// ============================================================================

export const MAIndicator: IndicatorPlugin = {
  id: "@builtin/ma",
  name: "Simple Moving Average",
  version: "1.0.0",
  description: "简单移动平均线，支持多个周期",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "periods",
      type: "number",
      default: [9, 25],
      label: "周期列表",
      description: "用逗号分隔的周期数值数组"
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const periods = params?.[0] || [9, 25];
    const results = periods.map((period, index) => ({
      period,
      values: SMA(bars, period).map(v => v.value),
      color: ["#f0b90b", "#00d4ff", "#848e9c"][index % 3]
    }));
    
    return {
      series: null, // Will be created in onSeriesCreate
      data: [],
      values: results.reduce((acc, r) => {
        acc[`ma-${r.period}`] = r.values;
        return acc;
      }, {} as Record<string, number[]>)
    };
  },
  
  onSeriesCreate: (series, context) => {
    // Customize series appearance
    if (series && typeof series.applyOptions === 'function') {
      series.applyOptions({
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true
      });
    }
  },
  
  onInit: (context) => {
    context.log("MA indicator initialized");
  }
};

// ============================================================================
// Exponential Moving Average (EMA)
// ============================================================================

export const EMAIndicator: IndicatorPlugin = {
  id: "@builtin/ema",
  name: "Exponential Moving Average",
  version: "1.0.0",
  description: "指数移动平均线，对近期价格赋予更高权重",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "periods",
      type: "number",
      default: [12, 26],
      label: "周期列表",
      description: "EMA 计算周期"
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const periods = params?.[0] || [12, 26];
    const results = periods.map((period, index) => ({
      period,
      values: EMA(bars, period).map(v => v.value),
      color: ["#f0b90b", "#00d4ff"][index % 2]
    }));
    
    return {
      series: null,
      data: [],
      values: results.reduce((acc, r) => {
        acc[`ema-${r.period}`] = r.values;
        return acc;
      }, {} as Record<string, number[]>)
    };
  }
};

// ============================================================================
// Bollinger Bands (BOLL)
// ============================================================================

export const BOLLIndicator: IndicatorPlugin = {
  id: "@builtin/boll",
  name: "Bollinger Bands",
  version: "1.0.0",
  description: "布林带指标，用于判断市场波动性和价格区间",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "period",
      type: "number",
      default: 20,
      label: "周期",
      min: 5,
      max: 100,
      description: "移动平均线周期"
    },
    {
      name: "stdDev",
      type: "number",
      default: 2,
      label: "标准差倍数",
      min: 1,
      max: 3,
      description: "上下轨的标准差倍数"
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const period = params?.[0] ?? 20;
    const stdDev = params?.[1] ?? 2;
    
    const boll = BollingerBands(bars, period, stdDev);
    
    return {
      series: null,
      data: [
        { time: Math.floor(Date.now() / 1000), value: boll.mid[boll.mid.length - 1]?.value ?? 0 },
        { time: Math.floor(Date.now() / 1000), value: boll.upper[boll.upper.length - 1]?.value ?? 0 },
        { time: Math.floor(Date.now() / 1000), value: boll.lower[boll.lower.length - 1]?.value ?? 0 }
      ],
      values: {
        mid: boll.mid.map(v => v.value),
        upper: boll.upper.map(v => v.value),
        lower: boll.lower.map(v => v.value)
      }
    };
  }
};

// ============================================================================
// Relative Strength Index (RSI)
// ============================================================================

export const RSIIndicator: IndicatorPlugin = {
  id: "@builtin/rsi",
  name: "Relative Strength Index",
  version: "1.0.0",
  description: "相对强弱指标，用于判断超买超卖状态",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "period",
      type: "number",
      default: 14,
      label: "周期",
      min: 5,
      max: 50,
      description: "RSI 计算周期"
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const period = params?.[0] ?? 14;
    const rsiData = RSI(bars, period);
    
    return {
      series: null,
      data: [{
        time: Math.floor(Date.now() / 1000),
        value: rsiData[rsiData.length - 1]?.value ?? 50
      }],
      values: {
        rsi: rsiData.map(v => v.value)
      }
    };
  }
};

// ============================================================================
// MACD (Moving Average Convergence Divergence)
// ============================================================================

export const MACDIndicator: IndicatorPlugin = {
  id: "@builtin/macd",
  name: "MACD",
  version: "1.0.0",
  description: "平滑异同移动平均线，用于趋势分析",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "fastPeriod",
      type: "number",
      default: 12,
      label: "快周期",
      min: 5,
      max: 30
    },
    {
      name: "slowPeriod",
      type: "number",
      default: 26,
      label: "慢周期",
      min: 10,
      max: 50
    },
    {
      name: "signalPeriod",
      type: "number",
      default: 9,
      label: "信号周期",
      min: 5,
      max: 20
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const fastPeriod = params?.[0] ?? 12;
    const slowPeriod = params?.[1] ?? 26;
    const signalPeriod = params?.[2] ?? 9;
    
    const macd = MACD(bars, fastPeriod, slowPeriod, signalPeriod);
    
    return {
      series: null,
      data: [
        { time: Math.floor(Date.now() / 1000), value: macd.dif[macd.dif.length - 1]?.value ?? 0 },
        { time: Math.floor(Date.now() / 1000), value: macd.dea[macd.dea.length - 1]?.value ?? 0 },
        { time: Math.floor(Date.now() / 1000), value: macd.hist[macd.hist.length - 1]?.value ?? 0 }
      ],
      values: {
        dif: macd.dif.map(v => v.value),
        dea: macd.dea.map(v => v.value),
        hist: macd.hist.map(v => v.value)
      }
    };
  }
};

// ============================================================================
// KDJ (Stochastic Oscillator)
// ============================================================================

export const KDJIndicator: IndicatorPlugin = {
  id: "@builtin/kdj",
  name: "KDJ Stochastic",
  version: "1.0.0",
  description: "随机指标，用于短期价格动量分析",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "n",
      type: "number",
      default: 9,
      label: "N 周期",
      min: 5,
      max: 20
    },
    {
      name: "m1",
      type: "number",
      default: 3,
      label: "M1 周期",
      min: 2,
      max: 10
    },
    {
      name: "m2",
      type: "number",
      default: 3,
      label: "M2 周期",
      min: 2,
      max: 10
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const n = params?.[0] ?? 9;
    const m1 = params?.[1] ?? 3;
    const m2 = params?.[2] ?? 3;
    
    const kdj = KDJ(bars, n, m1, m2);
    
    return {
      series: null,
      data: [
        { time: Math.floor(Date.now() / 1000), value: kdj.K[kdj.K.length - 1]?.value ?? 50 },
        { time: Math.floor(Date.now() / 1000), value: kdj.D[kdj.D.length - 1]?.value ?? 50 },
        { time: Math.floor(Date.now() / 1000), value: kdj.J[kdj.J.length - 1]?.value ?? 50 }
      ],
      values: {
        K: kdj.K.map(v => v.value),
        D: kdj.D.map(v => v.value),
        J: kdj.J.map(v => v.value)
      }
    };
  }
};

// ============================================================================
// Volume Profile (VPVR-like simplified)
// ============================================================================

export const VolumeProfile: IndicatorPlugin = {
  id: "@builtin/volume-profile",
  name: "Volume Profile",
  version: "1.0.0",
  description: "成交量分布图，显示各价格区间的成交量",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "lookback",
      type: "number",
      default: 100,
      label: "回溯根数",
      min: 50,
      max: 500
    }
  ],
  
  compute: (bars: Candle[], params?: number[]) => {
    const lookback = params?.[0] ?? 100;
    const recentBars = bars.slice(-lookback);
    
    // Find price range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    
    for (const bar of recentBars) {
      minPrice = Math.min(minPrice, bar.low);
      maxPrice = Math.max(maxPrice, bar.high);
    }
    
    // Create volume profile buckets
    const bucketSize = (maxPrice - minPrice) / 20;
    const buckets = new Array(20).fill(0).map(() => ({ priceRange: [] as number[], totalVolume: 0 }));
    
    for (const bar of recentBars) {
      const bucketIndex = Math.floor((bar.close - minPrice) / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < 20) {
        buckets[bucketIndex].priceRange.push(bar.close);
        buckets[bucketIndex].totalVolume += bar.volume;
      }
    }
    
    // Normalize to max volume
    const maxVol = Math.max(...buckets.map(b => b.totalVolume));
    
    return {
      series: null,
      data: buckets.map((bucket, i) => ({
        time: Math.floor(Date.now() / 1000),
        value: bucket.totalVolume,
        price: minPrice + (i + 0.5) * bucketSize
      })),
      values: {
        profile: buckets,
        pvp: buckets.filter(b => b.totalVolume > maxVol * 0.7).map(b => b.priceRange)
      }
    };
  }
};

// ============================================================================
// Export all built-in indicators
// ============================================================================

export const builtinIndicators: IndicatorPlugin[] = [
  MAIndicator,
  EMAIndicator,
  BOLLIndicator,
  RSIIndicator,
  MACDIndicator,
  KDJIndicator,
  VolumeProfile
];

/**
 * Get a specific indicator plugin by ID
 */
export function getIndicatorById(id: string): IndicatorPlugin | undefined {
  return builtinIndicators.find(ind => ind.id === id);
}

/**
 * Search indicators by keyword
 */
export function searchIndicators(keyword: string): IndicatorPlugin[] {
  const query = keyword.toLowerCase();
  return builtinIndicators.filter(ind => 
    ind.name.toLowerCase().includes(query) || 
    (ind.description?.toLowerCase().includes(query) ?? false)
  );
}

/**
 * Register all built-in indicators with the plugin manager
 */
export function registerBuiltInIndicators(pluginManager: any): void {
  for (const indicator of builtinIndicators) {
    pluginManager.register(indicator);
  }
}
