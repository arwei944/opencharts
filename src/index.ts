/**
 * ApexChart - Professional K-line Charting Library
 * 
 * 开箱即用的专业级 K 线图表组件
 * 
 * @example
 * ```tsx
 * import { ApexChart } from "apex-engine";
 * 
 * function App() {
 *   return (
 *     <div className="h-[600px]">
 *       <ApexChart symbol="BTCUSDT" />
 *     </div>
 *   );
 * }
 * ```
 */

// ============================================================================
// Main Components
// ============================================================================

export { ApexChart } from "./components/ApexChart";
export type { ApexChartOptions, ApexChartProps } from "./components/ApexChart";

// Export examples
export { BasicExample } from "./components/examples/BasicExample";
export { AdvancedExample } from "./components/examples/AdvancedExample";
export { DataLayerExample, AdvancedDataLayerExample, MockDataExample } from "./components/examples/DataLayerExample";

// ============================================================================
// Data Layer
// ============================================================================

// Types
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
} from "./data/types";

// Managers
export { 
  RestApiManager, 
  createDefaultRestApi, 
  DEFAULT_REST_CONFIG 
} from "./data/rest-api";

export { 
  WebSocketManager, 
  createDefaultWsManager, 
  DEFAULT_WS_CONFIG 
} from "./data/websocket-manager";

export { 
  CacheManager, 
  createDefaultCacheManager, 
  getDefaultCache, 
  DEFAULT_CACHE_CONFIG 
} from "./data/cache-manager";

export { 
  DataAggregator, 
  createBinanceDataProvider, 
  createLightDataProvider 
} from "./data/data-aggregator";

// Utilities
export { 
  encodeBars, 
  decodeBars, 
  isValidRecord, 
  compressRecord, 
  mergeRecords, 
  truncateRecord,
  expandRecordIfNeeded,
  serializeForDebug 
} from "./data/kline-cache";

// Error handling
export { DataError, DataErrorCode } from "./data/types";

// Stream helpers
export { 
  STREAM_NAMES, 
  BINANCE_PATHS, 
  getStreamName, 
  getMultiStream 
} from "./data/types";

// ============================================================================
// Plugin System
// ============================================================================

// Types
export type {
  ChartPlugin,
  IndicatorPlugin,
  OverlayPlugin,
  AnalysisToolPlugin,
  UiComponentPlugin,
  PluginContext,
  InstalledPlugin,
  LoadPluginOptions,
  PluginSearchResult,
  IndicatorResult,
  IndicatorFunction,
  IndicatorParam,
  OverlayType,
  OverlayPoint,
  OverlayElement,
  AnalysisResult,
  AnalysisResultType,
  PluginMetadata,
  PluginHooks,
  ChartTheme,
  ThemeColors,
  ThemeSpacing,
} from "./plugins/types";

// Core
export { 
  PluginManager, 
  getPluginManager, 
  resetPluginManager 
} from "./plugins/plugin-manager";

export { 
  ThemeManager, 
  getThemeManager, 
  resetThemeManager 
} from "./plugins/themes";

// Built-in indicators
export { 
  builtinIndicators, 
  getIndicatorById, 
  searchIndicators, 
  registerBuiltInIndicators 
} from "./plugins/built-in-indicators";

// Examples
export { 
  registerAllCustomPlugins, 
  setupCustomThemes, 
  exampleUsage 
} from "./plugins/examples";

// Example themes
export { 
  DARK_THEME, 
  LIGHT_THEME, 
  TRADINGVIEW_THEME, 
  GOLD_THEME, 
  CUSTOM_LIGHT_THEME 
} from "./plugins/themes";

// ============================================================================
// Exporters
// ============================================================================

export { 
  ChartExporter, 
  DataExporter, 
  PrintHelper 
} from "./exporters";

export type {
  ImageExportOptions,
  DataExportOptions,
  PrintOptions,
} from "./exporters";

export { 
  getChartExporter, 
  getDataExporter, 
  getPrintHelper, 
  resetExporters 
} from "./exporters";

export { useChartScreenshot, useDataExporter } from "./exporters";

// ============================================================================
// Settings & Types
// ============================================================================

export { DEFAULT_SETTINGS } from "./lib/market/settings";
export type { ChartSettings } from "./lib/market/settings";

export type {
  Candle as MarketCandle,
  ChartType,
  IndicatorInst,
  ThemeMode,
} from "./lib/market/types";

// ============================================================================
// Utils
// ============================================================================

export { cn } from "./lib/utils";

// ============================================================================
// Version
// ============================================================================

export const VERSION = "3.0.0";

/**
 * Get library version information
 */
export function getVersion(): string {
  return `ApexChart v${VERSION}`;
}
