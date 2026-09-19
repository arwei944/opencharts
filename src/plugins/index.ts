/**
 * Plugin System - Main Entry
 * 
 * 插件系统的统一出口，导出所有公共 API
 */

export { PluginManager, getPluginManager, resetPluginManager } from "./plugin-manager";
export { ThemeManager, getThemeManager, resetThemeManager, DARK_THEME, LIGHT_THEME, TRADINGVIEW_THEME, GOLD_THEME, CUSTOM_LIGHT_THEME } from "./themes";
export { builtinIndicators, getIndicatorById, searchIndicators, registerBuiltInIndicators } from "./built-in-indicators";

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
} from "./types";

export type {
  ChartTheme,
  ThemeColors,
  ThemeSpacing,
} from "./themes";

// Type re-exports
export type { PluginMetadata, PluginHooks } from "./types";
