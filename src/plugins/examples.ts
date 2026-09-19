/**
 * Plugin System Examples - 插件系统使用示例
 */

import { PluginManager, ThemeManager } from "./plugin-manager";
import { builtinIndicators } from "./built-in-indicators";
import type { ChartPlugin, IndicatorPlugin, OverlayPoint } from "./types";

// ============================================================================
// Example 1: 自定义 MA 指标（增强版）
// ============================================================================

const EnhancedMAIndicator: IndicatorPlugin = {
  id: "@custom/enhanced-ma",
  name: "Enhanced Moving Average",
  version: "1.0.0",
  description: "增强的移动平均线，支持交叉信号提示",
  category: "indicator",
  requiresData: true,
  
  parameters: [
    {
      name: "periods",
      type: "number",
      default: [5, 20],
      label: "周期列表",
      description: "如 [5, 20] 表示显示 MA5 和 MA20"
    },
    {
      name: "showCrossoverSignals",
      type: "boolean",
      default: false,
      label: "显示交叉信号",
      description: "在图表上标注金叉/死叉位置"
    }
  ],
  
  compute: async (bars: any[], params?: any[]) => {
    const periods = params?.periods || [5, 20];
    const showSignals = params?.showCrossoverSignals || false;
    
    // Calculate multiple MAs
    const maResults = periods.map(period => {
      const values = calculateSMA(bars, period);
      return { period, values };
    });
    
    // Detect crossovers if requested
    let crossoverPoints: OverlayPoint[] = [];
    if (showSignals && periods.length >= 2) {
      crossoverPoints = detectCrossovers(bars, maResults);
    }
    
    return {
      series: null,
      data: [],
      values: {
        ...maResults.reduce((acc, r) => ({ ...acc, [`ma-${r.period}`]: r.values }), {}),
        crossoverPoints
      }
    };
  }
};

// Helper functions
function calculateSMA(bars: any[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const sum = bars.slice(i - period + 1, i + 1).reduce((acc, bar) => acc + bar.close, 0);
    result.push(sum / period);
  }
  return result;
}

function detectCrossovers(bars: any[], maResults: Array<{ period: number; values: number[] }>): OverlayPoint[] {
  if (maResults.length < 2) return [];
  
  const points: OverlayPoint[] = [];
  const fastMA = maResults[0].values;
  const slowMA = maResults[1].values;
  
  for (let i = 1; i < bars.length; i++) {
    if (Number.isNaN(fastMA[i - 1]) || Number.isNaN(slowMA[i - 1])) continue;
    
    const prevDiff = fastMA[i - 1] - slowMA[i - 1];
    const currDiff = fastMA[i] - slowMA[i];
    
    if (prevDiff <= 0 && currDiff > 0) {
      // Golden cross (bullish)
      points.push({
        time: bars[i].time,
        price: bars[i].close,
        pixelX: 0,
        pixelY: 0
      });
    } else if (prevDiff >= 0 && currDiff < 0) {
      // Death cross (bearish)
      points.push({
        time: bars[i].time,
        price: bars[i].close,
        pixelX: 0,
        pixelY: 0
      });
    }
  }
  
  return points;
}

// ============================================================================
// Example 2: 斐波那契回撤覆盖层
// ============================================================================

const FibonacciRetracment: ChartPlugin = {
  id: "@custom/fib-retracement",
  name: "Fibonacci Retracement",
  version: "1.0.0",
  description: "斐波那契回撤工具，用于标记关键支撑阻力位",
  category: "overlay",
  requiresData: false,
  
  onInit: (context) => {
    const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
    context.log(`Fibonacci levels: ${levels.join(", ")}`);
  },
  
  onClick: (param, context) => {
    if (!param.point) return;
    
    const time = context.chart.timeScale().coordinateToTime(param.point.x);
    const price = context.chart.mainSeries()?.coordinateToPrice(param.point.y);
    
    if (time && price) {
      context.log("Click detected at:", { time, price, x: param.point.x, y: param.point.y });
    }
  }
};

// ============================================================================
// Example 3: 自定义主题（赛博朋克风格）
// ============================================================================

const CYBERPUNK_THEME = {
  id: "cyberpunk",
  name: "Cyberpunk 2077",
  description: "赛博朋克 2077 风格霓虹主题",
  colors: {
    bg: "#0c0c1e",
    text: "#fcee0b",
    grid: "#2d1b4e",
    up: "#00ffc8",
    down: "#ff0055",
    crosshair: "#00d4ff",
    axisLabel: "#ff00ff",
    
    ma1: "#fcee0b",
    ma2: "#ff9900",
    ma3: "#ff00ff",
    bollMid: "#00ffc8",
    bollUpper: "#ff0055",
    bollLower: "#ff0055",
    rsi: "#00d4ff",
    macdDif: "#00ffc8",
    macdDea: "#ff00ff",
    histogramUp: "#00ffc844",
    histogramDown: "#ff005544",
    
    volumeUp: "#00ffc866",
    volumeDown: "#ff005566",
  },
  spacing: {
    barSpacing: 10,
    crosshairWidth: 2,
    fontSize: 12,
    tooltipOffset: 12,
  },
  fontStyle: {
    fontFamily: "'Orbitron', 'Arial Black', sans-serif",
    fontWeight: "700",
  }
};

// ============================================================================
// Example 4: 键盘快捷键插件
// ============================================================================

const KeyboardShortcutsPlugin: ChartPlugin = {
  id: "@custom/keyboard-shortcuts",
  name: "Keyboard Shortcuts",
  version: "1.0.0",
  description: "自定义键盘快捷键支持",
  category: "tool",
  
  onInit: (context) => {
    // Add shortcut for fullscreen toggle
    context.addShortcut(["f11"], (event) => {
      event.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    
    // Add shortcut for taking screenshot
    context.addShortcut(["p"], (event) => {
      event.preventDefault();
      const canvas = context.chart.takeScreenshot();
      if (canvas) {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chart-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
        });
      }
    });
    
    context.log("Keyboard shortcuts registered");
  }
};

// ============================================================================
// Example 5: 多时间框架叠加插件（MTF）
// ============================================================================

const MTFOverlay: ChartPlugin = {
  id: "@custom/mtf-overlay",
  name: "Multi-Timeframe Overlay",
  version: "1.0.0",
  description: "在当前图表上叠加其他周期的 K 线",
  category: "overlay",
  requiresData: true,
  
  parameters: [
    {
      name: "sourceIntervals",
      type: "select",
      default: ["1h", "4h"],
      options: ["1h", "4h", "1d"],
      label: "源周期列表",
      description: "要叠加的其他时间周期"
    }
  ],
  
  onInit: (context) => {
    context.log("MTF overlay initialized");
  },
  
  onCrosshairMove: (param, context) => {
    if (param.seriesData) {
      // Display additional timeframe data in tooltip
      const mtfData = param.seriesData.get("mtf-overlay");
      if (mtfData) {
        console.log("MTF data:", mtfData);
      }
    }
  }
};

// ============================================================================
// Example 6: 数据监控面板组件
// ============================================================================

interface DataPanelProps {
  symbol: string;
  lastPrice: number;
  changePercent: number;
}

const DataPanel: React.FC<DataPanelProps> = ({ symbol, lastPrice, changePercent }) => {
  const isPositive = changePercent >= 0;
  
  return (
    <div className="bg-black bg-opacity-80 p-4 rounded-lg border border-gray-700">
      <h3 className="text-white font-bold mb-2">{symbol}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-gray-400 text-sm">最新价</span>
          <div className={`text-xl font-bold ${isPositive ? "text-green-500" : "text-red-500"}`}>
            {lastPrice.toFixed(2)}
          </div>
        </div>
        <div>
          <span className="text-gray-400 text-sm">涨跌幅</span>
          <div className={`text-xl font-bold ${isPositive ? "text-green-500" : "text-red-500"}`}>
            {Math.abs(changePercent).toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
};

// This would be used like:
/*
const DataPanelPlugin: UiComponentPlugin = {
  id: "@custom/data-panel",
  name: "Market Data Panel",
  version: "1.0.0",
  category: "ui",
  mountPoint: "corner",
  zIndex: 100,
  component: DataPanel,
  componentProps: { /* props will be provided by framework *\/ }
};
*/

// ============================================================================
// Usage Guide
// ============================================================================

export function registerAllCustomPlugins(manager: PluginManager): void {
  // Register custom indicators
  manager.register(EnhancedMAIndicator);
  manager.register(FibonacciRetrencement as any);
  
  // Register tools
  manager.register(KeyboardShortcutsPlugin);
  manager.register(MTFOverlay as any);
  
  console.log("Registered all custom plugins");
}

export function setupCustomThemes(themeManager: ThemeManager): void {
  themeManager.register(CYBERPUNK_THEME as any);
  console.log("Registered cyberpunk theme");
}

export function exampleUsage(): void {
  // Initialize plugin manager
  const pm = new PluginManager();
  pm.initialize(null, null, null, null); // Need chart instance
  
  // Register built-in indicators
  for (const indicator of builtinIndicators) {
    pm.register(indicator);
  }
  
  // Register custom plugin
  pm.register(EnhancedMAIndicator, { enabled: true });
  
  // List all plugins
  const plugins = pm.list();
  console.log("Active plugins:", plugins.map(p => p.name));
  
  // Enable/disable plugin
  pm.toggle(false, "@custom/enhanced-ma");
  
  // Export state
  const state = pm.exportState();
  console.log("Plugin state:", state);
}
