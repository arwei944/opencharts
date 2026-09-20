import type { Candle } from "./types";
import { sma, ema, boll, rsi, macd, kdj, atr, obv, vwap, supertrend } from "./indicators";

/**
 * Indicator Engine - Professional Trading-Style Indicator System
 * Similar to TradingView's Pine Script with custom execution engine
 */

export interface IndicatorDef {
  id: string;
  name: string;
  category: "Trend" | "Momentum" | "Volatility" | "Volume" | "Oscillator";
  params: IndicatorParam[];
  description: string;
  defaultParams: Record<string, number | boolean>;
}

export interface IndicatorParam {
  name: string;
  label: string;
  type: "number" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  defaultValue: number | boolean;
  unit?: string;
}

export interface IndicatorInstance {
  id: string;
  kind: string;
  params: Record<string, number | boolean>;
  visible: boolean;
  color?: string;
  lineWidth?: number;
  plotType?: "line" | "histogram" | "points";
}

export interface IndicatorResult {
  data: Array<{ time: number; value: number; color?: string }>;
  seriesType: "main" | "overlay" | "panel";
  paneIndex?: number;
  color?: string;
  lineWidth?: number;
}

export class IndicatorEngine {
  private indicatorRegistry: Map<string, IndicatorDef> = new Map();
  private instances: Map<string, IndicatorInstance> = new Map();
  
  constructor() {
    this.registerAllBuiltins();
  }

  /** Register built-in indicators (similar to Pine Script library) */
  private registerAllBuiltins() {
    this.registerIndicator({
      id: "MA",
      name: "Simple Moving Average",
      category: "Trend",
      description: "Calculates the simple moving average over a specified period.",
      params: [
        {
          name: "period",
          label: "Period",
          type: "number",
          min: 2,
          max: 500,
          step: 1,
          defaultValue: 9,
          unit: "bars"
        }
      ],
      defaultParams: { period: 9 }
    });

    this.registerIndicator({
      id: "EMA",
      name: "Exponential Moving Average",
      category: "Trend",
      description: "Calculates the exponential moving average with more weight on recent prices.",
      params: [
        {
          name: "period",
          label: "Period",
          type: "number",
          min: 2,
          max: 500,
          step: 1,
          defaultValue: 9,
          unit: "bars"
        }
      ],
      defaultParams: { period: 9 }
    });

    this.registerIndicator({
      id: "BOLL",
      name: "Bollinger Bands",
      category: "Volatility",
      description: "Measures volatility using standard deviations from a moving average.",
      params: [
        {
          name: "period",
          label: "Period",
          type: "number",
          min: 5,
          max: 100,
          step: 1,
          defaultValue: 20,
          unit: "bars"
        },
        {
          name: "stdDev",
          label: "Standard Deviation",
          type: "number",
          min: 0.5,
          max: 5,
          step: 0.1,
          defaultValue: 2,
          unit: "deviations"
        }
      ],
      defaultParams: { period: 20, stdDev: 2 }
    });

    this.registerIndicator({
      id: "RSI",
      name: "Relative Strength Index",
      category: "Momentum",
      description: "Momentum oscillator measuring speed and change of price movements.",
      params: [
        {
          name: "period",
          label: "Period",
          type: "number",
          min: 2,
          max: 100,
          step: 1,
          defaultValue: 14,
          unit: "bars"
        }
      ],
      defaultParams: { period: 14 }
    });

    this.registerIndicator({
      id: "MACD",
      name: "Moving Average Convergence Divergence",
      category: "Momentum",
      description: "Shows relationship between two moving averages of a security.",
      params: [
        {
          name: "fastLength",
          label: "Fast Length",
          type: "number",
          min: 2,
          max: 100,
          step: 1,
          defaultValue: 12,
          unit: "bars"
        },
        {
          name: "slowLength",
          label: "Slow Length",
          type: "number",
          min: 5,
          max: 200,
          step: 1,
          defaultValue: 26,
          unit: "bars"
        },
        {
          name: "signalLength",
          label: "Signal Smoothing",
          type: "number",
          min: 1,
          max: 50,
          step: 1,
          defaultValue: 9,
          unit: "bars"
        }
      ],
      defaultParams: { fastLength: 12, slowLength: 26, signalLength: 9 }
    });

    this.registerIndicator({
      id: "KDJ",
      name: "Stochastic Oscillator (KDJ)",
      category: "Oscillator",
      description: "Momentum indicator comparing closing price to price range over time.",
      params: [
        {
          name: "rsiLen",
          label: "RSI Length",
          type: "number",
          min: 3,
          max: 100,
          step: 1,
          defaultValue: 9,
          unit: "bars"
        },
        {
          name: "stochLen",
          label: "Stoch Length",
          type: "number",
          min: 3,
          max: 100,
          step: 1,
          defaultValue: 3,
          unit: "bars"
        },
        {
          name: "trgLlen",
          label: "TRGM Length",
          type: "number",
          min: 3,
          max: 100,
          step: 1,
          defaultValue: 3,
          unit: "bars"
        }
      ],
      defaultParams: { rsiLen: 9, stochLen: 3, trgLlen: 3 }
    });

    // Add more indicators as needed...
  }

  /** Register a custom indicator definition */
  registerIndicator(def: IndicatorDef): void {
    this.indicatorRegistry.set(def.id, def);
  }

  /** Get all available indicators */
  getAvailableIndicators(): IndicatorDef[] {
    return Array.from(this.indicatorRegistry.values());
  }

  /** Get indicator details by ID */
  getIndicatorDetails(id: string): IndicatorDef | undefined {
    return this.indicatorRegistry.get(id);
  }

  /** Create an indicator instance with parameters */
  createInstance(kind: string, params: Record<string, number | boolean> = {}): IndicatorInstance {
    const def = this.indicatorRegistry.get(kind);
    if (!def) {
      throw new Error(`Unknown indicator: ${kind}`);
    }

    // Merge default params with provided params
    const mergedParams: Record<string, number | boolean> = {};
    for (const param of def.params) {
      mergedParams[param.name] = params[param.name] ?? param.defaultValue;
    }

    const instance: IndicatorInstance = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      kind,
      params: mergedParams,
      visible: true,
      color: this.getDefaultColor(kind),
      lineWidth: 1,
      plotType: "line"
    };

    this.instances.set(instance.id, instance);
    return instance;
  }

  /** Remove an indicator instance */
  removeInstance(id: string): void {
    this.instances.delete(id);
  }

  /** Update an existing instance */
  updateInstance(id: string, updates: Partial<IndicatorInstance>): void {
    const instance = this.instances.get(id);
    if (instance) {
      Object.assign(instance, updates);
    }
  }

  /** Toggle visibility */
  toggleVisibility(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.visible = !instance.visible;
    }
  }

  /** Calculate indicator data for given bars */
  calculate(instance: IndicatorInstance, bars: Candle[]): IndicatorResult[] {
    const result: IndicatorResult[] = [];
    
    switch (instance.kind) {
      case "MA": {
        const period = instance.params.period as number || 9;
        const data = sma(bars, period);
        result.push({
          data,
          seriesType: "overlay",
          paneIndex: 0,
          color: instance.color,
          lineWidth: instance.lineWidth
        });
        break;
      }

      case "EMA": {
        const period = instance.params.period as number || 9;
        const data = ema(bars, period);
        result.push({
          data,
          seriesType: "overlay",
          paneIndex: 0,
          color: instance.color,
          lineWidth: instance.lineWidth
        });
        break;
      }

      case "BOLL": {
        const period = instance.params.period as number || 20;
        const stdDev = instance.params.stdDev as number || 2;
        const { mid, upper, lower } = boll(bars, period, stdDev);
        
        result.push({
          data: mid,
          seriesType: "overlay",
          paneIndex: 0,
          color: "#f0b90b",
          lineWidth: 1
        });
        result.push({
          data: upper,
          seriesType: "overlay",
          paneIndex: 0,
          color: "#848e9c",
          lineWidth: 1
        });
        result.push({
          data: lower,
          seriesType: "overlay",
          paneIndex: 0,
          color: "#848e9c",
          lineWidth: 1
        });
        break;
      }

      case "RSI": {
        const period = instance.params.period as number || 14;
        const data = rsi(bars, period);
        result.push({
          data,
          seriesType: "panel",
          paneIndex: 1,
          color: instance.color,
          lineWidth: 1
        });
        break;
      }

      case "MACD": {
        const fastLength = instance.params.fastLength as number || 12;
        const slowLength = instance.params.slowLength as number || 26;
        const signalLength = instance.params.signalLength as number || 9;
        const { dif, dea, hist } = macd(bars, fastLength, slowLength, signalLength);
        
        result.push({
          data: hist.map(h => ({ ...h, color: h.color })),
          seriesType: "panel",
          paneIndex: 2,
          color: undefined,
          lineWidth: 0
        });
        result.push({
          data: dif,
          seriesType: "panel",
          paneIndex: 2,
          color: "#f0b90b",
          lineWidth: 1
        });
        result.push({
          data: dea,
          seriesType: "panel",
          paneIndex: 2,
          color: "#00d4ff",
          lineWidth: 1
        });
        break;
      }

      case "KDJ": {
        const rsiLen = instance.params.rsiLen as number || 9;
        const stochLen = instance.params.stochLen as number || 3;
        const trgLLen = instance.params.trgLLen as number || 3;
        const { k, d, j } = kdj(bars, rsiLen, stochLen, trgLLen);
        
        result.push({
          data: k,
          seriesType: "panel",
          paneIndex: 2,
          color: "#f0b90b",
          lineWidth: 1
        });
        result.push({
          data: d,
          seriesType: "panel",
          paneIndex: 2,
          color: "#00d4ff",
          lineWidth: 1
        });
        result.push({
          data: j,
          seriesType: "panel",
          paneIndex: 2,
          color: "#f6465d",
          lineWidth: 1
        });
        break;
      }

      // Add more cases for other indicators...

      default: {
        console.warn(`Unsupported indicator: ${instance.kind}`);
      }
    }

    return result;
  }

  /** Calculate tail update for live data */
  calculateTailUpdate(instance: IndicatorInstance, tail: Candle[]): IndicatorResult[] {
    const result: IndicatorResult[] = [];
    
    const lastPoint = (data: IndicatorResult["data"]) => {
      if (data.length === 0) return null;
      return data[data.length - 1];
    };

    switch (instance.kind) {
      case "MA": {
        const period = instance.params.period as number || 9;
        const data = sma(tail, period);
        const point = lastPoint(data);
        result.push({
          data: point ? [point] : [],
          seriesType: "overlay",
          paneIndex: 0,
          color: instance.color,
          lineWidth: instance.lineWidth
        });
        break;
      }

      case "EMA": {
        const period = instance.params.period as number || 9;
        const data = ema(tail, period);
        const point = lastPoint(data);
        result.push({
          data: point ? [point] : [],
          seriesType: "overlay",
          paneIndex: 0,
          color: instance.color,
          lineWidth: instance.lineWidth
        });
        break;
      }

      case "RSI": {
        const period = instance.params.period as number || 14;
        const data = rsi(tail, period);
        const point = lastPoint(data);
        result.push({
          data: point ? [point] : [],
          seriesType: "panel",
          paneIndex: 1,
          color: instance.color,
          lineWidth: instance.lineWidth
        });
        break;
      }

      case "MACD": {
        const fastLength = instance.params.fastLength as number || 12;
        const slowLength = instance.params.slowLength as number || 26;
        const signalLength = instance.params.signalLength as number || 9;
        const { dif, dea, hist } = macd(tail, fastLength, slowLength, signalLength);
        
        const histPoint = lastPoint(hist);
        const difPoint = lastPoint(dif);
        const deaPoint = lastPoint(dea);
        
        if (histPoint) {
          result.push({
            data: [histPoint],
            seriesType: "panel",
            paneIndex: 2,
            color: undefined,
            lineWidth: 0
          });
        }
        if (difPoint) {
          result.push({
            data: [difPoint],
            seriesType: "panel",
            paneIndex: 2,
            color: "#f0b90b",
            lineWidth: 1
          });
        }
        if (deaPoint) {
          result.push({
            data: [deaPoint],
            seriesType: "panel",
            paneIndex: 2,
            color: "#00d4ff",
            lineWidth: 1
          });
        }
        break;
      }

      default: {
        // Generic handler for unknown indicators
        console.warn(`No tail update handler for: ${instance.kind}`);
      }
    }

    return result;
  }

  /** Generate sample code similar to Pine Script */
  generateScript(instance: IndicatorInstance): string {
    const def = this.indicatorRegistry.get(instance.kind);
    if (!def) return "";

    let script = `//@version=5\n`;
    script += `// ${def.name}\n\n`;
    
    script += `indicator("${def.name}", overlay=${def.category === "Trend" || def.category === "Volatility"})\n\n`;
    
    script += `// Parameters\n`;
    for (const param of def.params) {
      script += `length = input.int(${param.defaultValue}, "${param.label}", minval=1)\n`;
    }
    
    script += `\n// Calculation\n`;
    script += `// TODO: Implement calculation logic here\n`;
    
    script += `\nplot(result)\n`;
    
    return script;
  }

  /** Helper to get default colors */
  private getDefaultColor(kind: string): string {
    const colors: Record<string, string> = {
      MA: "#f0b90b",
      EMA: "#00d4ff",
      BOLL: "#f0b90b",
      RSI: "#f0b90b",
      MACD: "#f0b90b",
      KDJ: "#f0b90b",
    };
    return colors[kind] || "#848e9c";
  }
}

// Singleton instance
export const indicatorEngine = new IndicatorEngine();
