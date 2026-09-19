/**
 * Theme System - 主题管理系统
 * 
 * 支持自定义图表主题（配色、字体、间距等）
 */

export interface ThemeColors {
  bg: string;                    // 背景色
  text: string;                  // 文本颜色
  grid: string;                  // 网格线颜色
  up: string;                    // 上涨色
  down: string;                  // 下跌色
  crosshair: string;             // 十字线颜色
  axisLabel: string;             // 坐标轴标签颜色
  
  // 指标线条颜色
  ma1: string;
  ma2: string;
  ma3: string;
  bollMid: string;
  bollUpper: string;
  bollLower: string;
  rsi: string;
  macdDif: string;
  macdDea: string;
  histogramUp: string;
  histogramDown: string;
  
  // 成交量
  volumeUp: string;
  volumeDown: string;
}

export interface ThemeSpacing {
  barSpacing: number;            // K 线柱间距
  crosshairWidth: number;        // 十字线宽度
  fontSize: number;              // 字体大小
  tooltipOffset: number;         // 提示框偏移
}

export interface ChartTheme {
  id: string;                     // 主题 ID
  name: string;                   // 主题名称
  description?: string;           // 主题描述
  author?: string;                // 作者
  colors: ThemeColors;            // 颜色配置
  spacing: ThemeSpacing;          // 间距配置
  fontStyle?: {
    fontFamily: string;
    fontWeight?: string;
  };
}

// ============================================================================
// Built-in Themes
// ============================================================================

export const DARK_THEME: ChartTheme = {
  id: "dark",
  name: "Dark Pro",
  description: "专业深色主题，适合夜间交易",
  colors: {
    bg: "#1a1a1a",
    text: "#d1d5db",
    grid: "#2d3748",
    up: "#f6465d",
    down: "#00d4ff",
    crosshair: "#8b9dc4",
    axisLabel: "#718096",
    
    ma1: "#f0b90b",
    ma2: "#b7bdc6",
    ma3: "#00d4ff",
    bollMid: "#f0b90b",
    bollUpper: "#848e9c",
    bollLower: "#848e9c",
    rsi: "#f0b90b",
    macdDif: "#f0b90b",
    macdDea: "#00d4ff",
    histogramUp: "#f6465d88",
    histogramDown: "#00d4ff88",
    
    volumeUp: "#f6465d88",
    volumeDown: "#00d4ff88",
  },
  spacing: {
    barSpacing: 7,
    crosshairWidth: 1,
    fontSize: 11,
    tooltipOffset: 8,
  },
  fontStyle: {
    fontFamily: "IBM Plex Sans, sans-serif",
    fontWeight: "400",
  }
};

export const LIGHT_THEME: ChartTheme = {
  id: "light",
  name: "Light Classic",
  description: "经典浅色主题，适合日间使用",
  colors: {
    bg: "#ffffff",
    text: "#1f2937",
    grid: "#e5e7eb",
    up: "#f6465d",
    down: "#00d4ff",
    crosshair: "#8b9dc4",
    axisLabel: "#6b7280",
    
    ma1: "#f0b90b",
    ma2: "#1f2937",
    ma3: "#00d4ff",
    bollMid: "#f0b90b",
    bollUpper: "#6b7280",
    bollLower: "#6b7280",
    rsi: "#f0b90b",
    macdDif: "#f0b90b",
    macdDea: "#00d4ff",
    histogramUp: "#f6465d66",
    histogramDown: "#00d4ff66",
    
    volumeUp: "#f6465d66",
    volumeDown: "#00d4ff66",
  },
  spacing: {
    barSpacing: 7,
    crosshairWidth: 1,
    fontSize: 11,
    tooltipOffset: 8,
  },
  fontStyle: {
    fontFamily: "IBM Plex Sans, sans-serif",
    fontWeight: "400",
  }
};

export const TRADINGVIEW_THEME: ChartTheme = {
  id: "tradingview",
  name: "TradingView Default",
  description: "TradingView 风格主题",
  colors: {
    bg: "#131722",
    text: "#d1d5db",
    grid: "#2a2e39",
    up: "#26a69a",
    down: "#ef5350",
    crosshair: "#758696",
    axisLabel: "#6e7282",
    
    ma1: "#f2a900",
    ma2: "#4b8aff",
    ma3: "#e91d62",
    bollMid: "#f2a900",
    bollUpper: "#555555",
    bollLower: "#555555",
    rsi: "#f2a900",
    macdDif: "#f2a900",
    macdDea: "#555555",
    histogramUp: "#26a69a66",
    histogramDown: "#ef535066",
    
    volumeUp: "#26a69a66",
    volumeDown: "#ef535066",
  },
  spacing: {
    barSpacing: 11,
    crosshairWidth: 1,
    fontSize: 12,
    tooltipOffset: 6,
  },
  fontStyle: {
    fontFamily: "Atkinson Hyperlegible, sans-serif",
    fontWeight: "400",
  }
};

export const GOLD_THEME: ChartTheme = {
  id: "gold",
  name: "Gold Luxury",
  description: "奢华金色主题，彰显尊贵",
  colors: {
    bg: "#0a0a0a",
    text: "#ffd700",
    grid: "#2d2d2d",
    up: "#ff6b6b",
    down: "#4ecdc4",
    crosshair: "#ffd700",
    axisLabel: "#b8860b",
    
    ma1: "#ffd700",
    ma2: "#ffa500",
    ma3: "#ffff00",
    bollMid: "#ffd700",
    bollUpper: "#ffa500aa",
    bollLower: "#ffa500aa",
    rsi: "#ffd700",
    macdDif: "#ffd700",
    macdDea: "#ffa500",
    histogramUp: "#ff6b6b88",
    histogramDown: "#4ecdc488",
    
    volumeUp: "#ff6b6b88",
    volumeDown: "#4ecdc488",
  },
  spacing: {
    barSpacing: 9,
    crosshairWidth: 2,
    fontSize: 13,
    tooltipOffset: 10,
  },
  fontStyle: {
    fontFamily: "Montserrat, sans-serif",
    fontWeight: "500",
  }
};

export const CUSTOM_LIGHT_THEME: ChartTheme = {
  id: "custom-light",
  name: "Custom Light",
  description: "清新浅色主题，护眼舒适",
  colors: {
    bg: "#fafafa",
    text: "#333333",
    grid: "#dddddd",
    up: "#e91d62",
    down: "#0288d1",
    crosshair: "#666666",
    axisLabel: "#888888",
    
    ma1: "#e91d62",
    ma2: "#0288d1",
    ma3: "#9c27b0",
    bollMid: "#ff9800",
    bollUpper: "#ff5722",
    bollLower: "#ff5722",
    rsi: "#9c27b0",
    macdDif: "#e91d62",
    macdDea: "#0288d1",
    histogramUp: "#e91d6266",
    histogramDown: "#0288d166",
    
    volumeUp: "#e91d6266",
    volumeDown: "#0288d166",
  },
  spacing: {
    barSpacing: 8,
    crosshairWidth: 1,
    fontSize: 11,
    tooltipOffset: 8,
  },
  fontStyle: {
    fontFamily: "Open Sans, sans-serif",
    fontWeight: "400",
  }
};

// ============================================================================
// Theme Manager Class
// ============================================================================

export class ThemeManager {
  private themes = new Map<string, ChartTheme>();
  private currentThemeId: string = "dark";
  private listeners = new Set<(theme: ChartTheme) => void>();
  
  constructor() {
    this.registerAllBuiltInThemes();
  }
  
  /**
   * Register all built-in themes
   */
  registerAllBuiltInThemes(): void {
    this.register(DARK_THEME);
    this.register(LIGHT_THEME);
    this.register(TRADINGVIEW_THEME);
    this.register(GOLD_THEME);
    this.register(CUSTOM_LIGHT_THEME);
  }
  
  /**
   * Register a custom theme
   */
  register(theme: ChartTheme): boolean {
    if (this.themes.has(theme.id)) {
      console.warn(`[ThemeManager] Theme '${theme.id}' already exists`);
      return false;
    }
    
    this.themes.set(theme.id, theme);
    this.notifyListeners();
    return true;
  }
  
  /**
   * Get a theme by ID
   */
  get(themeId: string): ChartTheme | undefined {
    return this.themes.get(themeId);
  }
  
  /**
   * Get current theme
   */
  getCurrent(): ChartTheme {
    return this.themes.get(this.currentThemeId) ?? DARK_THEME;
  }
  
  /**
   * Switch to a different theme
   */
  switch(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme) {
      console.error(`[ThemeManager] Theme '${themeId}' not found`);
      return false;
    }
    
    this.currentThemeId = themeId;
    this.notifyListeners();
    return true;
  }
  
  /**
   * Add theme change listener
   */
  subscribe(callback: (theme: ChartTheme) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  /**
   * Notify all listeners of theme change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getCurrent());
      } catch (err) {
        console.error("[ThemeManager] Listener error:", err);
      }
    }
  }
  
  /**
   * List all available themes
   */
  list(enabledOnly?: boolean): ChartTheme[] {
    const list = Array.from(this.themes.values());
    return enabledOnly ? list.filter(t => t.enabled ?? true) : list;
  }
  
  /**
   * Search themes by keyword
   */
  search(keyword: string): ChartTheme[] {
    const query = keyword.toLowerCase();
    return Array.from(this.themes.values()).filter(t => 
      t.name.toLowerCase().includes(query) ||
      (t.description?.toLowerCase().includes(query) ?? false)
    );
  }
  
  /**
   * Export theme as JSON
   */
  exportTheme(themeId?: string): string {
    const theme = themeId ? this.themes.get(themeId) : this.getCurrent();
    if (!theme) {
      throw new Error("Theme not found");
    }
    
    return JSON.stringify(theme, null, 2);
  }
  
  /**
   * Import theme from JSON
   */
  importTheme(json: string): ChartTheme {
    const theme: Partial<ChartTheme> = JSON.parse(json);
    
    // Validate required fields
    if (!theme.id || !theme.name || !theme.colors) {
      throw new Error("Invalid theme format");
    }
    
    this.register(theme as ChartTheme);
    return theme as ChartTheme;
  }
  
  /**
   * Create a custom theme based on existing one
   */
  createCustomTheme(baseThemeId: string, overrides: Partial<ChartTheme>): ChartTheme {
    const base = this.themes.get(baseThemeId);
    if (!base) {
      throw new Error(`Base theme '${baseThemeId}' not found`);
    }
    
    const custom: ChartTheme = {
      ...base,
      id: `custom-${Date.now()}`,
      name: overrides.name ?? `${base.name} (Custom)`,
      colors: { ...base.colors, ...(overrides.colors ?? {}) },
      spacing: { ...base.spacing, ...(overrides.spacing ?? {}) },
      fontStyle: { ...base.fontStyle, ...(overrides.fontStyle ?? {}) },
    };
    
    this.register(custom);
    return custom;
  }
  
  /**
   * Delete a custom theme
   */
  delete(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme || !theme.id.startsWith("custom-")) {
      return false;
    }
    
    return this.themes.delete(themeId);
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalThemeManager: ThemeManager | null = null;

/**
 * Get the global theme manager instance
 */
export function getThemeManager(): ThemeManager {
  if (!globalThemeManager) {
    globalThemeManager = new ThemeManager();
  }
  return globalThemeManager;
}

/**
 * Reset the global theme manager (useful for testing)
 */
export function resetThemeManager(): void {
  globalThemeManager = null;
}

// ============================================================================
// Export default
// ============================================================================

export {
  THEME_COLORS_TYPE,
  THEME_SPACING_TYPE
} from "./types";

// Type re-exports for convenience
type THEME_COLORS_TYPE = typeof DARK_THEME.colors;
type THEME_SPACING_TYPE = typeof DARK_THEME.spacing;
