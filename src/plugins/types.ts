/**
 * ApexChart Plugin System - Type Definitions
 * 
 * 插件系统的核心类型定义，支持自定义指标、UI 组件和事件处理
 */

import type { IChartApi } from "lightweight-charts";
import type { ChartSettings, Candle, IndicatorInst } from "./types";

// ============================================================================
// 基础接口
// ============================================================================

/** 插件元数据 */
export interface PluginMetadata {
  id: string;                // 插件唯一标识
  name: string;              // 插件显示名称
  version: string;           // 版本号
  description?: string;      // 插件描述
  author?: string;           // 作者信息
  license?: string;          // 许可证
}

/** 插件上下文 */
export interface PluginContext {
  /** lightweight-charts API */
  chart: IChartApi;
  
  /** 图表状态管理 */
  settings: ChartSettings;
  
  /** 内置状态（未来可扩展） */
  store?: any;
  
  /** 数据供应器 */
  dataProvider?: any;
  
  /** 添加 UI 组件 */
  addUiComponent: (component: React.ReactNode) => void;
  
  /** 移除 UI 组件 */
  removeUiComponent: (key: string) => void;
  
  /** 添加快捷键 */
  addShortcut: (keys: string[], handler: (event: KeyboardEvent) => void) => void;
  
  /** 移除快捷键 */
  removeShortcut: (keys: string[]) => void;
  
  /** 日志输出 */
  log: (message: string, ...args: any[]) => void;
  
  /** 错误日志 */
  error: (message: string, error?: Error) => void;
}

/** 生命周期钩子 */
export interface PluginHooks {
  /** 插件初始化 */
  onInit?: (context: PluginContext) => void | Promise<void>;
  
  /** 挂载到 DOM */
  onMount?: (context: PluginContext) => void | Promise<void>;
  
  /** 卸载前清理 */
  onUnmount?: (context: PluginContext) => void | Promise<void>;
  
  /** 主题切换 */
  onThemeChange?: (theme: "dark" | "light") => void;
  
  /** 图表尺寸变化 */
  onResize?: (width: number, height: number) => void;
  
  /** 十字线移动 */
  onCrosshairMove?: (param: any) => void;
  
  /** 点击事件 */
  onClick?: (param: { point?: { x: number; y: number }; time?: any }) => void;
  
  /** 键盘按键 */
  onKeyDown?: (event: KeyboardEvent) => void;
}

// ============================================================================
// 主插件接口
// ============================================================================

/** 插件基类 */
export interface ChartPlugin extends PluginMetadata, PluginHooks {
  /** 插件 ID（建议格式：@scope/plugin-name） */
  id: string;
  
  /** 插件版本 */
  version: string;
  
  /** 插件类型分类 */
  category?: "indicator" | "overlay" | "tool" | "analysis" | "ui";
  
  /** 是否需要数据源 */
  requiresData?: boolean;
  
  /** 是否依赖其他插件 */
  dependencies?: string[];
  
  /** 配置选项 Schema（JSON Schema） */
  schema?: object;
  
  /** 默认配置 */
  defaults?: any;
  
  /** UI 渲染（React 组件） */
  render?(context: PluginContext): React.ReactNode;
  
  /** 自定义事件处理器 */
  eventHandlers?: {
    crosshairMove?: (param: any, context: PluginContext) => void;
    click?: (param: any, context: PluginContext) => void;
    wheel?: (param: any, context: PluginContext) => void;
  };
  
  /** 导出插件状态 */
  saveState?(): any;
  
  /** 导入插件状态 */
  loadState?(state: any): void;
}

// ============================================================================
// 指标插件
// ============================================================================

/** 指标计算结果 */
export interface IndicatorResult {
  series: any;                    // lightweight-charts series
  data: Array<{ time: number; value: number; color?: string }>;
  values?: Record<string, number[]>;  // 多值输出（如 MACD 的 dif/dea/hist）
}

/** 指标函数签名 */
export type IndicatorFunction = (
  bars: Candle[],
  params?: number[]
) => IndicatorResult | Promise<IndicatorResult>;

/** 指标参数定义 */
export interface IndicatorParam {
  name: string;                   // 参数名
  type: "number" | "boolean" | "select";
  default: number | boolean | string;
  min?: number;                   // 数值范围
  max?: number;
  options?: string[];             // select 类型选项
  label?: string;                 // 显示标签
  description?: string;           // 参数说明
}

/** 指标元数据 */
export interface IndicatorPlugin extends ChartPlugin {
  category: "indicator";
  
  /** 指标计算函数 */
  compute: IndicatorFunction;
  
  /** 指标参数定义 */
  parameters?: IndicatorParam[];
  
  /** 绘制回调（可以在 series 上定制样式） */
  onSeriesCreate?: (series: any, context: PluginContext) => void;
}

// ============================================================================
// 覆盖层插件
// ============================================================================

/** 覆盖层类型 */
export type OverlayType = "fibonacci" | "rectangle" | "trendline" | "arrow" | "text" | "custom";

/** 覆盖层点位置 */
export interface OverlayPoint {
  time: number;
  price: number;
  pixelX?: number;
  pixelY?: number;
}

/** 覆盖层元素 */
export interface OverlayElement {
  id: string;
  type: OverlayType;
  points: OverlayPoint[];
  style?: {
    color?: string;
    lineWidth?: number;
    fontSize?: number;
    opacity?: number;
  };
  metadata?: any;
}

/** 覆盖层插件 */
export interface OverlayPlugin extends ChartPlugin {
  category: "overlay";
  
  /** 支持的覆盖层类型 */
  types?: OverlayType[];
  
  /** 添加覆盖层 */
  addOverlay?(element: OverlayElement): void;
  
  /** 移除覆盖层 */
  removeOverlay?(id: string): void;
  
  /** 更新覆盖层 */
  updateOverlay?(id: string, updates: Partial<OverlayElement>): void;
  
  /** 获取所有覆盖层 */
  getOverlays?(): OverlayElement[];
  
  /** 清空所有覆盖层 */
  clearOverlays?(): void;
  
  /** 导出为 SVG/Canvas */
  exportToSVG?(): string;
}

// ============================================================================
// 分析工具插件
// ============================================================================

/** 分析结果类型 */
export type AnalysisResultType = 
  | "support_resistance" 
  | "trendline" 
  | "pattern" 
  | "volume_profile"
  | "pivot_points"
  | "custom";

/** 分析结果 */
export interface AnalysisResult {
  type: AnalysisResultType;
  timestamp: number;
  data: any;
  confidence?: number;            // 置信度（0-1）
  labels?: Array<{ time: number; price: number; label: string }>;
}

/** 分析工具插件 */
export interface AnalysisToolPlugin extends ChartPlugin {
  category: "analysis";
  
  /** 分析类型 */
  analysisTypes?: AnalysisResultType[];
  
  /** 执行分析 */
  runAnalysis?(type: AnalysisResultType, context: PluginContext): Promise<AnalysisResult>;
  
  /** 注册分析回调 */
  onAnalysisComplete?(callback: (result: AnalysisResult) => void): void;
}

// ============================================================================
// UI 组件插件
// ============================================================================

/** UI 组件类型 */
export interface UiComponentPlugin extends ChartPlugin {
  category: "ui";
  
  /** UI 组件挂载位置 */
  mountPoint?: "toolbar" | "sidebar" | "overlay" | "bottom-panel" | "corner";
  
  /** 组件优先级（后加载的覆盖先加载的） */
  zIndex?: number;
  
  /** React 组件 */
  component: React.ComponentType<any>;
  
  /** 组件 props */
  componentProps?: any;
}

// ============================================================================
// 插件管理器
// ============================================================================

/** 已安装插件 */
export interface InstalledPlugin extends ChartPlugin {
  instance: ChartPlugin;
  enabled: boolean;
  state?: any;
  loadedAt?: number;
}

/** 插件加载选项 */
export interface LoadPluginOptions {
  /** 是否启用 */
  enabled?: boolean;
  
  /** 插件配置 */
  config?: any;
  
  /** 重载标志 */
  forceReload?: boolean;
}

/** 插件搜索结果 */
export interface PluginSearchResult {
  plugin: ChartPlugin;
  score: number;
  matches?: string[];
}

// ============================================================================
// 工具函数类型
// ============================================================================

/** 颜色转换函数 */
export interface ColorConverter {
  hexToRgb(hex: string): { r: number; g: number; b: number };
  rgbToHex(r: number, g: number, b: number): string;
  rgbaToCss(rgba: { r: number; g: number; b: number; a: number }): string;
}

/** 时间格式化 */
export interface TimeFormatter {
  formatTime(time: number): string;
  formatDate(time: number): string;
  formatDuration(seconds: number): string;
}

/** 价格格式化 */
export interface PriceFormatter {
  formatPrice(price: number, decimals?: number): string;
  formatPercent(value: number): string;
  formatVolume(volume: number): string;
}

// ============================================================================
// 导出
// ============================================================================

export type {
  IndicatorResult,
  IndicatorFunction,
  IndicatorParam,
  IndicatorPlugin,
  OverlayType,
  OverlayPoint,
  OverlayElement,
  OverlayPlugin,
  AnalysisResultType,
  AnalysisResult,
  AnalysisToolPlugin,
  UiComponentPlugin,
  InstalledPlugin,
  LoadPluginOptions,
  PluginSearchResult,
  ColorConverter,
  TimeFormatter,
  PriceFormatter,
};
