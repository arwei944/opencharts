/**
 * Plugin Manager - Core Implementation
 * 
 * 插件管理系统的核心实现，负责插件的注册、加载、卸载和生命周期管理
 */

import type {
  ChartPlugin,
  IndicatorPlugin,
  OverlayPlugin,
  AnalysisToolPlugin,
  UiComponentPlugin,
  PluginContext,
  InstalledPlugin,
  LoadPluginOptions,
  PluginSearchResult,
} from "./types";

// ============================================================================
// Plugin Context Implementation
// ============================================================================

class PluginContextImpl implements PluginContext {
  public chart: any;
  public settings: any;
  public store?: any;
  public dataProvider?: any;
  
  private uiComponents = new Map<string, React.ReactNode>();
  private shortcuts = new Map<string, Array<{ keys: string[]; handler: (event: KeyboardEvent) => void }>>();
  private logBuffer: Array<{ level: "info" | "error"; message: string; args: any[]; timestamp: number }> = [];
  
  constructor(options: { chart: any; settings: any; store?: any; dataProvider?: any }) {
    this.chart = options.chart;
    this.settings = options.settings;
    this.store = options.store;
    this.dataProvider = options.dataProvider;
  }
  
  addUiComponent(component: React.ReactNode): void {
    const key = `component-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.uiComponents.set(key, component);
  }
  
  removeUiComponent(key: string): void {
    this.uiComponents.delete(key);
  }
  
  getUiComponents(): Map<string, React.ReactNode> {
    return this.uiComponents;
  }
  
  addShortcut(keys: string[], handler: (event: KeyboardEvent) => void): void {
    const keyStr = keys.join("+").toLowerCase();
    if (!this.shortcuts.has(keyStr)) {
      this.shortcuts.set(keyStr, []);
      
      // 监听键盘事件
      document.addEventListener("keydown", (event) => {
        if (keys.some((k) => k.toLowerCase() === event.key.toLowerCase())) {
          handler(event);
        }
      });
    }
    this.shortcuts.get(keyStr)!.push({ keys, handler });
  }
  
  removeShortcut(keys: string[]): void {
    const keyStr = keys.join("+").toLowerCase();
    this.shortcuts.delete(keyStr);
  }
  
  log(message: string, ...args: any[]): void {
    const entry = { level: "info" as const, message, args, timestamp: Date.now() };
    this.logBuffer.push(entry);
    
    // 限制日志缓冲区大小
    if (this.logBuffer.length > 100) {
      this.logBuffer.shift();
    }
    
    console.log(`[Plugin:${message}]`, ...args);
  }
  
  error(message: string, error?: Error): void {
    const entry = { level: "error" as const, message, args: [error], timestamp: Date.now() };
    this.logBuffer.push(entry);
    
    console.error(`[Plugin Error:${message}]`, error);
  }
  
  getLogs(): typeof this.logBuffer {
    return [...this.logBuffer];
  }
  
  clearLogs(): void {
    this.logBuffer = [];
  }
}

// ============================================================================
// Plugin Manager Class
// ============================================================================

export class PluginManager {
  private plugins = new Map<string, InstalledPlugin>();
  private context?: PluginContext;
  private readonly defaultLogLevel = "info";
  
  /**
   * Initialize with chart and other dependencies
   */
  initialize(chart: any, settings: any, store?: any, dataProvider?: any): void {
    this.context = new PluginContextImpl({ chart, settings, store, dataProvider });
  }
  
  /**
   * Get plugin context
   */
  getContext(): PluginContext | undefined {
    return this.context;
  }
  
  /**
   * Register a single plugin
   */
  register(plugin: ChartPlugin, options: LoadPluginOptions = {}): boolean {
    if (!this.context) {
      throw new Error("PluginManager not initialized. Call initialize() first.");
    }
    
    const installed: InstalledPlugin = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      instance: plugin,
      enabled: options.enabled ?? true,
      loadedAt: Date.now(),
    };
    
    // 检查依赖
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          console.warn(`[PluginManager] Missing dependency for ${plugin.name}: ${depId}`);
          return false;
        }
      }
    }
    
    // 注册插件
    this.plugins.set(plugin.id, installed);
    
    // 初始化插件
    if (installed.enabled && plugin.onInit) {
      try {
        plugin.onInit(this.context).catch((err) => {
          this.context.error(`onInit failed for ${plugin.name}`, err);
        });
      } catch (err) {
        this.context.error(`onInit exception for ${plugin.name}`, err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    }
    
    this.context.log(`Registered plugin: ${plugin.name} v${plugin.version}`);
    return true;
  }
  
  /**
   * Bulk register plugins
   */
  registerAll(plugins: ChartPlugin[], options?: LoadPluginOptions): number {
    let registered = 0;
    for (const plugin of plugins) {
      if (this.register(plugin, options)) {
        registered++;
      }
    }
    return registered;
  }
  
  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): boolean {
    const installed = this.plugins.get(pluginId);
    if (!installed) {
      return false;
    }
    
    const plugin = installed.instance;
    
    // 调用卸载钩子
    if (plugin.onUnmount && this.context) {
      try {
        plugin.onUnmount(this.context);
      } catch (err) {
        console.error(`onUnmount error for ${plugin.name}:`, err);
      }
    }
    
    this.plugins.delete(pluginId);
    this.context?.log(`Unregistered plugin: ${plugin.name}`);
    return true;
  }
  
  /**
   * Enable/disable a plugin
   */
  toggle(enabled: boolean, pluginId: string): boolean {
    const installed = this.plugins.get(pluginId);
    if (!installed) {
      return false;
    }
    
    installed.enabled = enabled;
    
    // TODO: Implement enable/disable logic based on plugin category
    
    this.context?.log(`${enabled ? "Enabled" : "Disabled"} plugin: ${installed.name}`);
    return true;
  }
  
  /**
   * Get a specific plugin
   */
  get(pluginId: string): InstalledPlugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  /**
   * List all registered plugins
   */
  list(enabledOnly?: boolean): InstalledPlugin[] {
    const list = Array.from(this.plugins.values());
    return enabledOnly ? list.filter((p) => p.enabled) : list;
  }
  
  /**
   * Search plugins by keyword
   */
  search(keyword: string, fields: ("name" | "description" | "id")[] = ["name"]): PluginSearchResult[] {
    const results: PluginSearchResult[] = [];
    const query = keyword.toLowerCase();
    
    for (const installed of this.plugins.values()) {
      const matches: string[] = [];
      let score = 0;
      
      for (const field of fields) {
        const value = installed[field]?.toLowerCase() ?? "";
        if (value.includes(query)) {
          matches.push(field);
          score += field === "name" ? 3 : field === "id" ? 2 : 1;
        }
      }
      
      if (score > 0) {
        results.push({ plugin: installed.instance, score, matches });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Check if a plugin is installed
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
  
  /**
   * Count registered plugins
   */
  count(): number {
    return this.plugins.size;
  }
  
  /**
   * Clear all plugins
   */
  clear(): void {
    for (const installed of this.plugins.values()) {
      if (installed.instance.onUnmount && this.context) {
        try {
          installed.instance.onUnmount(this.context);
        } catch {}
      }
    }
    this.plugins.clear();
  }
  
  /**
   * Export plugin state
   */
  exportState(pluginId?: string): any {
    if (pluginId) {
      const installed = this.plugins.get(pluginId);
      if (!installed || !installed.instance.saveState) {
        return null;
      }
      return { [pluginId]: installed.instance.saveState() };
    }
    
    const state: any = {};
    for (const installed of this.plugins.values()) {
      if (installed.instance.saveState) {
        state[installed.id] = installed.instance.saveState();
      }
    }
    return state;
  }
  
  /**
   * Import plugin state
   */
  importState(state: any): void {
    for (const [pluginId, pluginState] of Object.entries(state)) {
      const installed = this.plugins.get(pluginId);
      if (installed && installed.instance.loadState) {
        try {
          installed.instance.loadState(pluginState);
        } catch (err) {
          console.error(`Failed to load state for ${pluginId}:`, err);
        }
      }
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalPluginManager: PluginManager | null = null;

/**
 * Get the global plugin manager instance
 */
export function getPluginManager(): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager();
  }
  return globalPluginManager;
}

/**
 * Reset the global plugin manager (useful for testing)
 */
export function resetPluginManager(): void {
  globalPluginManager = null;
}
