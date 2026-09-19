import { create } from "zustand";
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { ChartToolbar } from "./terminal/ChartToolbar";
import { SettingsModal } from "./terminal/SettingsModal";
import { IndicatorModal } from "./terminal/IndicatorModal";
import { SymbolSearch } from "./terminal/SymbolSearch";
import { DEFAULT_SETTINGS } from "../lib/market/settings";
import type { ChartSettings } from "../lib/market/settings";
import type { Candle, Interval, ChartType, ThemeMode, IndicatorInst, Market } from "../lib/market/types";
import { createBinanceDataProvider, type DataProviderOptions } from "../data/data-aggregator";
import { DataErrorBoundary } from "../lib/error-boundary";

interface DataFeed {
  subscribeData: (symbol: string, interval: Interval) => void;
  unsubscribeData: () => void;
}

interface ApexChartOptions {
  /** 初始标的，默认为 BTCUSDT */
  symbol?: string;
  /** 初始市场类型，默认为 spot */
  market?: Market;
  /** 初始周期，默认为 15m */
  interval?: Interval;
  /** K 线图类型，默认为 candle */
  chartType?: ChartType;
  /** 是否反转涨跌颜色，默认为 false */
  invert?: boolean;
  /** 是否启用对数坐标，默认为 false */
  logScale?: boolean;
  /** 是否显示成交量，默认为 true */
  showVol?: boolean;
  /** 主题模式，默认为 dark */
  theme?: ThemeMode;
  /** 图表配置项 */
  settings?: Partial<ChartSettings>;
  /** 已添加的指标列表 */
  indicators?: IndicatorInst[];
  /** 数据供应选项（使用内置 Binance 数据源） */
  providerOptions?: DataProviderOptions;
  /** 自定义数据供应器 */
  customDataProvider?: DataProvider | null;
  /** 容器样式 */
  containerClassName?: string;
  /** 图表容器 ID */
  containerId?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 加载回调 */
  onLoad?: (api: IChartApi, dataProvider: DataProvider) => void;
  /** 卸载回调 */
  onDestroy?: () => void;
  /** 切换标的回调 */
  onSymbolChange?: (symbol: string, market: Market) => void;
  /** 切换周期回调 */
  onIntervalChange?: (interval: Interval) => void;
  /** 切换图类型回调 */
  onChartTypeChange?: (chartType: ChartType) => void;
  /** 错误处理 */
  onError?: (error: Error) => void;
}

interface ChartState {
  symbol: string;
  market: Market;
  interval: Interval;
  chartType: ChartType;
  invert: boolean;
  logScale: boolean;
  showVol: boolean;
  theme: ThemeMode;
  settings: ChartSettings;
  indicators: IndicatorInst[];
  bars: Candle[];
  overlay: Candle | null;
}

/** 创建带初始化的 store（singleton 模式） */
const useChartStore = create<ChartState>((set) => ({
  symbol: "BTCUSDT",
  market: "spot" as Market,
  interval: "15m" as Interval,
  chartType: "candle" as ChartType,
  invert: false,
  logScale: false,
  showVol: true,
  theme: "dark" as ThemeMode,
  settings: DEFAULT_SETTINGS,
  indicators: [
    { id: "ma-default", kind: "MA", params: [7, 25], visible: true },
    { id: "vol-default", kind: "VOL", params: [], visible: true },
  ],
  bars: [],
  overlay: null,
}));

/**
 * ApexChart - 开箱即用的专业 K 线图表组件
 * 
 * @param options 配置选项
 * @returns React 组件
 * 
 * @example
 * ```tsx
 * // 基础用法：无需任何配置即可使用
 * <ApexChart />
 * 
 * // 定制配置
 * <ApexChart 
 *   symbol="ETHUSDT"
 *   interval="1h"
 *   theme="light"
 *   indicators={[{ kind: "RSI", params: [14] }]}
 * />
 * 
 * // 带数据供应
 * <ApexChart 
 *   dataProvider={{
 *     getBars: async (symbol, market, interval) => {
 *       const res = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}`);
 *       return res.json();
 *     }
 *   }}
 * />
 * ```
 */
export function ApexChart({
  symbol: initialSymbol = "BTCUSDT",
  market = "spot" as Market,
  interval = "15m" as Interval,
  chartType = "candle" as ChartType,
  invert = false,
  logScale = false,
  showVol = true,
  theme = "dark" as ThemeMode,
  settings: customSettings,
  indicators: initialIndicators,
  providerOptions,
  customDataProvider = null,
  containerClassName = "",
  containerId = `apex-chart-${Date.now()}`,
  style,
  onLoad,
  onDestroy,
  onSymbolChange,
  onIntervalChange,
  onChartTypeChange,
  onError,
}: ApexChartOptions = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dataProviderRef = useRef<DataProvider | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // 创建数据供应器（仅在首次渲染时）
  useLayoutEffect(() => {
    if (!customDataProvider && !dataProviderRef.current) {
      try {
        const provider = customDataProvider || createBinanceDataProvider(providerOptions);
        dataProviderRef.current = provider;
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error("Failed to create data provider");
        setError(errObj);
        onError?.(errObj);
      }
    }
    
    return () => {
      dataProviderRef.current?.disconnect().catch(console.error);
    };
  }, []);
  
  // 使用 zustand 管理本地状态（singleton）
  const chartState = useChartStore();

  const {
    symbol,
    market,
    interval,
    chartType,
    invert,
    logScale,
    showVol,
    theme,
    settings,
    indicators,
    bars,
    overlay,
  } = chartState;

  // 初始化时设置 props（仅在首次渲染）
  useLayoutEffect(() => {
    useChartStore.getState().set({
      symbol: initialSymbol,
      market,
      interval,
      chartType,
      invert,
      logScale,
      showVol,
      theme,
      settings: customSettings ? { ...DEFAULT_SETTINGS, ...customSettings } : DEFAULT_SETTINGS,
      indicators: initialIndicators ?? [
        { id: "ma-default", kind: "MA", params: [7, 25], visible: true },
        { id: "vol-default", kind: "VOL", params: [], visible: true },
      ],
    });
  }, []); // 仅一次

  // 响应外部变化（持续同步）
  useEffect(() => {
    useChartStore.setState({
      chartType,
      invert,
      logScale,
      showVol,
      theme,
    });
  }, [chartType, invert, logScale, showVol, theme]);

  useEffect(() => {
    if (customSettings) {
      useChartStore.setState({
        settings: { ...DEFAULT_SETTINGS, ...customSettings },
      });
    }
  }, [customSettings]);

  useEffect(() => {
    if (initialIndicators) {
      useChartStore.setState({
        indicators: initialIndicators,
      });
    }
  }, [initialIndicators]);

  // 加载历史数据（使用 DataProvider）
  useEffect(() => {
    const provider = dataProviderRef.current;
    if (!provider) return;

    let mounted = true;
    
    const loadHistory = async () => {
      try {
        setError(null);
        const bars = await provider.getBars(symbol, market, interval, 1000);
        if (mounted) {
          useChartStore.setState({ bars });
        }
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error("Failed to load history");
        if (mounted) {
          setError(errObj);
          onError?.(errObj);
        }
      }
    };

    loadHistory();
    
    // 节流回调 (60fps max)
    let lastTickTime = 0;
    const THROTTLE_MS = 16;
    
    const unsubscribe = provider.subscribeTick(symbol, market, (tick: Candle) => {
      // 节流：跳过频繁 tick
      if (tick.time - lastTickTime < THROTTLE_MS && lastTickTime !== 0) {
        return;
      }
      lastTickTime = tick.time;
      
      useChartStore.setState((state) => {
        const currentBars = state.bars.slice();
        const lastBar = currentBars[currentBars.length - 1];
        
        if (lastBar && tick.time === lastBar.time) {
          // 更新当前 K 线
          currentBars[currentBars.length - 1] = tick;
        } else {
          // 创建新的 K 线
          currentBars.push(tick);
        }
        
        return { bars: currentBars.slice(-1000) };
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [symbol, market, interval, onError]);

  // 初始化图表
  useEffect(() => {
    if (!hostRef.current) return;

    let chart: IChartApi | null = null;

    try {
      chart = createChart(hostRef.current!, {
        width: hostRef.current!.clientWidth,
        height: hostRef.current!.clientHeight,
        layout: {
          background: { type: 1 as any, color: theme === "dark" ? "#1a1a1a" : "#ffffff" },
          textColor: theme === "dark" ? "#d1d5db" : "#1f2937",
          fontFamily: "IBM Plex Sans, sans-serif",
          fontSize: 12,
        },
        grid: {
          vertLines: { color: theme === "dark" ? "#2d3748" : "#e5e7eb" },
          horzLines: { color: theme === "dark" ? "#2d3748" : "#e5e7eb" },
        },
        crosshair: {
          mode: 0 as any,
          vertLine: {
            style: 2 as any,
            width: settings.crosshairWidth,
            labelBackgroundColor: settings.crosshairLabelBg,
          },
          horzLine: {
            style: 2 as any,
            width: settings.crosshairWidth,
            labelBackgroundColor: settings.crosshairLabelBg,
          },
        },
        rightPriceScale: {
          scaleMargins: { top: settings.priceScaleMargins[0], bottom: settings.priceScaleMargins[1] },
        },
        timeScale: {
          barSpacing: settings.barSpacing,
          rightOffset: settings.timeRightOffset,
        },
      });

      chartRef.current = chart;
      setReady(true);

      // 订阅十字线移动
      chart.subscribeCrosshairMove((param) => {
        const time = typeof param.time === "number" ? param.time : null;
        const price = param.seriesData?.get(chart.mainSeries())?.close ?? null;
        useChartStore.setState({ overlay: time && price ? { time, open: 0, high: price, low: price, close: price, volume: 0 } : null });
      });

      onLoad?.(chart, dataProviderRef.current!);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error("Failed to initialize chart");
      setError(errObj);
      onError?.(errObj);
    }

    return () => {
      chart?.remove();
      chartRef.current = null;
      onDestroy?.();
    };
  }, [theme, settings, onLoad, onDestroy, onError]);
  
  // 显示错误状态
  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${containerClassName}`} style={style}>
        <div className="text-center">
          <p className="mb-2 text-red-500 font-semibold">图表加载失败</p>
          <p className="text-sm text-gray-400">{error.message}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 更新蜡烛图
  useEffect(() => {
    if (!chartRef.current || !bars.length) return;

    const series = chartRef.current.mainSeries();
    series.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
  }, [bars]);

  // 更新指标（关键桥接）
  useEffect(() => {
    if (chartRef.current && indicators.length > 0) {
      chartRef.current.setIndicators(indicators);
    }
  }, [indicators]);

  // 响应外部变化
  useEffect(() => {
    useChartStore.setState({ chartType, invert, logScale, showVol, theme });
  }, [chartType, invert, logScale, showVol, theme]);

  // 工具栏回调
  const handleSymbolSelect = useCallback(
    async (newSymbol: string) => {
      onSymbolChange?.(newSymbol, market);
      useChartStore.setState({ symbol: newSymbol });
      
      // 切换标的时立即重新加载数据
      const provider = dataProviderRef.current;
      if (provider) {
        try {
          const bars = await provider.getBars(newSymbol, market, interval, 1000);
          useChartStore.setState({ bars });
        } catch (err) {
          console.error('Failed to load bars for new symbol:', err);
        }
      }
    },
    [market, onSymbolChange],
  );

  const handleIntervalChange = useCallback(
    async (newInterval: Interval) => {
      onIntervalChange?.(newInterval);
      useChartStore.setState({ interval: newInterval });
      
      // 切换周期时立即重新加载数据
      const provider = dataProviderRef.current;
      if (provider) {
        try {
          const bars = await provider.getBars(symbol, market, newInterval, 1000);
          useChartStore.setState({ bars });
        } catch (err) {
          console.error('Failed to load bars for new interval:', err);
        }
      }
    },
    [symbol, market, onIntervalChange],
  );

  const handleChartTypeChange = useCallback(
    (newType: ChartType) => {
      onChartTypeChange?.(newType);
      useChartStore.setState({ chartType: newType });
    },
    [onChartTypeChange],
  );

  const toggleInvert = useCallback(() => {
    useChartStore.setState((s) => ({ invert: !s.invert }));
  }, []);

  const toggleLog = useCallback(() => {
    useChartStore.setState((s) => ({ logScale: !s.logScale }));
  }, []);

  const toggleVol = useCallback(() => {
    useChartStore.setState((s) => ({ showVol: !s.showVol }));
  }, []);

  const toggleTheme = useCallback(() => {
    useChartStore.setState((s) => ({ theme: s.theme === "dark" ? "light" : "dark" }));
  }, []);

  const addIndicator = useCallback((kind: string) => {
    const specs: Record<string, number[]> = { MA: [9], BOLL: [20, 2], RSI: [14] };
    useChartStore.setState((s) => ({
      indicators: [...s.indicators, { id: `${kind}-${Date.now()}`, kind, params: specs[kind] ?? [], visible: true }],
    }));
  }, []);

  const removeIndicator = useCallback((id: string) => {
    useChartStore.setState((s) => ({ indicators: s.indicators.filter((i) => i.id !== id) }));
  }, []);

  const resetSettings = useCallback(() => {
    useChartStore.setState({ settings: DEFAULT_SETTINGS });
  }, []);
  
  const takeScreenshot = useCallback(() => {
    const canvas = chartRef.current?.takeScreenshot();
    if (!canvas) return;
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-${symbol}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [symbol]);
  
  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
  }, []);

  return (
    <div className={`flex flex-col h-full ${containerClassName}`} style={style}>
      {/* 顶部工具栏 */}
      <ChartToolbar
        engine={chartRef.current}
        paneId="p0"
        master={true}
        symbol={symbol}
        onSymbolSelect={handleSymbolSelect}
        interval={interval}
        onIntervalChange={handleIntervalChange}
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        invert={invert}
        onToggleInvert={toggleInvert}
        logScale={logScale}
        onToggleLog={toggleLog}
        showVol={showVol}
        onToggleVol={toggleVol}
        theme={theme}
        onToggleTheme={toggleTheme}
        indicators={indicators}
        onAddIndicator={addIndicator}
        onRemoveIndicator={removeIndicator}
        settings={settings}
        onResetSettings={resetSettings}
      />

      {/* 图表容器 */}
      <div className="relative flex-1 min-h-0">
        <div ref={hostRef} id={containerId} className="absolute inset-0" />
        
        {/* 叠加信息 */}
        {overlay && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 text-xs text-gray-400">
            O:{overlay.open.toFixed(2)} H:{overlay.high.toFixed(2)} L:{overlay.low.toFixed(2)} C:{overlay.close.toFixed(2)} V:{overlay.volume}
          </div>
        )}

        {/* 加载状态 */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
            加载中...
          </div>
        )}
      </div>

      {/* 弹窗组件 */}
      <SymbolSearch
        isOpen={false}
        onClose={() => {}}
        onSymbolSelect={handleSymbolSelect}
        currentSymbol={symbol}
        market={market}
      />
      <IndicatorModal />
      <SettingsModal />
    </div>
  );
}

// Export wrapped version with error handling
export const ApexChartWithErrors = withErrorBoundary(ApexChart, {
  onError: (error, info) => {
    console.error("ApexChart error:", error, info);
  },
  onRetry: () => {
    window.location.reload();
  },
});

// Default export uses error boundary
export default ApexChartWithErrors;

// 类型导出
export type { ApexChartOptions, ApexChartProps };
