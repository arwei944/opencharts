# ApexChart 架构升级方案 V2.0

## 🎯 总体目标

将图表组件改造为**真正的独立可复用产品**，包含：
1. **完整的数据层封装** - 后端 API、WebSocket、缓存统一管理
2. **插件化架构** - 支持动态扩展功能
3. **零配置即用** - 开箱即用的默认配置
4. **渐进式定制** - Props-based API 支持深度定制

---

## 📐 新架构设计

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (Your App)                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │           ApexChart Component                    │   │
│  │  - React Props (symbol, theme, settings)         │   │
│  │  - Event Handlers (onLoad, onError)              │   │
│  │  - External Data Provider (optional)             │   │
│  └─────────────────────┬────────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │         Data Layer (Internal/External)            │   │
│  │  ├── REST API Manager (历史数据)                   │   │
│  │  ├── WebSocket Manager (实时数据)                 │   │
│  │  ├── Cache Manager (IndexedDB/LocalStorage)       │   │
│  │  └── Data Aggregator (统一输出 Candle[])          │
│  └─────────────────────┬────────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │           State Management                        │   │
│  │  ├── Zustand Store (local state only)            │   │
│  │  ├── Indicator State                             │   │
│  │  ├── Settings State                              │   │
│  │  └── Drawing State                               │
│  └─────────────────────┬────────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │        Chart Engine (lightweight-charts)         │   │
│  │  ├── Series Management                           │   │
│  │  ├── Indicator Renderer                          │   │
│  │  ├── Crosshair & Interaction                     │   │
│  │  └── Render Pipeline (分帧渲染)                  │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块详解

### Module 1: Data Layer（数据层）

#### 1.1 REST API Manager

```typescript
// src/data/rest-api.ts

interface RestApiConfig {
  spotHosts: string[];
  futureHosts: string[];
  timeoutMs?: number;
  retryAttempts?: number;
}

class RestApiManager {
  private config: RestApiConfig;
  private stickyHosts: Record<Market, string | null> = {};
  
  // 历史 K 线获取
  async fetchKlines(params: KlineParams): Promise<Candle[]>;
  
  // 24 小时 ticker
  async fetchTicker(symbol: string, market: Market): Promise<Ticker>;
  
  // 订单簿深度
  async fetchDepth(symbol: string, market: Market): Promise<OrderBook>;
  
  // 搜索交易对
  async searchSymbols(q: string, market: Market): Promise<string[]>;
}
```

**特性：**
- ✅ Host 故障自动切换
- ✅ Sticky Host 优化连接复用
- ✅ 请求超时保护
- ✅ 失败重试机制

#### 1.2 WebSocket Manager

```typescript
// src/data/websocket-manager.ts

interface StreamDescriptor {
  stream: string;
  callback: (data: any) => void;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, StreamDescriptor> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  
  // 订阅实时流
  subscribe(streams: string[]): Promise<void>;
  
  // 取消订阅
  unsubscribe(streams: string[]): void;
  
  // 解析标准 K 线消息
  parseKlineMessage(data: any): Candle | null;
  
  // 错误处理和重连
  handleDisconnect(): void;
}
```

**支持的流：**
- `btcusdt@kline_1m` → 1 分钟 K 线
- `btcusdt@aggtrade` → 实时成交
- `btcusdt@ticker` → 24 小时行情
- `!miniticker@arr` → 所有币种 24h 聚合

#### 1.3 Cache Manager

```typescript
// src/data/cache-manager.ts

interface CacheOptions {
  maxEntries?: number;      // 最大缓存条目
  expirationMs?: number;    // 过期时间
  syncEnabled?: boolean;    // 是否启用同步策略
}

class CacheManager {
  private db: IDBDatabase | null = null;
  private options: CacheOptions;
  
  // 读取缓存（带过期检查）
  read(key: string): Promise<KlineCacheRecord | null>;
  
  // 写入缓存
  write(key: string, meta: CacheMeta, bars: Candle[]): Promise<void>;
  
  // 批量查询
  batchRead(keys: string[]): Promise<Map<string, Candle[]>>;
  
  // 清理过期数据
  prune(maxEntries?: number): Promise<void>;
  
  // 缓存命中统计
  getStats(): CacheStats;
}
```

**优化策略：**
- Binary storage (TypedArrays)
- 空间复杂度 O(1) 查询
- 后台异步修剪

#### 1.4 Data Aggregator（数据聚合器）

```typescript
// src/data/data-aggregator.ts

interface DataProviderOptions {
  restApi?: RestApiManager;
  wsManager?: WebSocketManager;
  cacheManager?: CacheManager;
  enableCache?: boolean;
  fallbackToMock?: boolean;
}

class DataAggregator {
  private rest: RestApiManager;
  private ws: WebSocketManager;
  private cache: CacheManager;
  private options: DataProviderOptions;
  
  // 主接口：获取历史数据
  async getBars(
    symbol: string, 
    market: Market, 
    interval: Interval, 
    count?: number
  ): Promise<Candle[]>;
  
  // 订阅实时 tick
  subscribeTick(
    symbol: string, 
    market: Market, 
    callback: (tick: Candle) => void
  ): () => void;
  
  // 获取 ticker 信息
  getTicker(symbol: string, market: Market): Promise<Ticker>;
  
  // 获取订单簿
  getOrderBook(symbol: string, market: Market, depth?: number): Promise<OrderBook>;
}

// 使用示例
const aggregator = new DataAggregator({
  restApi: new RestApiManager({
    spotHosts: ['https://api.binance.com'],
    futureHosts: ['https://fapi.binance.com']
  }),
  cacheManager: new CacheManager({ maxEntries: 10 })
});

export const defaultDataProvider = {
  getBars: aggregator.getBars.bind(aggregator),
  subscribeTick: aggregator.subscribeTick.bind(aggregator)
};
```

---

### Module 2: Plugin System（插件系统）

```typescript
// src/plugins/types.ts

interface ChartPlugin {
  id: string;
  name: string;
  version: string;
  
  // 生命周期钩子
  onInit?(chart: IChartApi): void;
  onMount?(context: PluginContext): void;
  onUnmount?(): void;
  
  // UI 扩展
  renderExtraUI?(context: PluginContext): React.ReactNode;
  
  // 事件拦截
  onEvent?(event: ChartEvent, context: PluginContext): void;
}

interface PluginContext {
  chart: IChartApi;
  store: ChartStore;
  dataProvider: DataProvider;
  settings: ChartSettings;
}

// 注册自定义指标插件
const customIndicator: ChartPlugin = {
  id: 'custom-rsi',
  name: 'Custom RSI',
  version: '1.0.0',
  
  onInit(chart) {
    const series = chart.addSeries(LineSeries, { color: '#FF6B6B' });
    // 计算自定义 RSI
    series.setData(computeCustomRSI());
  }
};

// 插件管理器
class PluginManager {
  private plugins: Map<string, ChartPlugin> = new Map();
  
  register(plugin: ChartPlugin): void;
  unregister(id: string): void;
  loadAll(context: PluginContext): void;
}
```

**内置插件：**
1. Volume Profile（成交量分布）
2. Fibonacci Retracement（斐波那契回撤）
3. Multiple Timeframes（多周期叠加）
4. Custom Pattern Recognition（形态识别）

---

### Module 3: Theme System（主题系统）

```typescript
// src/themes/index.ts

interface Theme {
  name: string;
  colors: {
    bg: string;
    text: string;
    grid: string;
    up: string;
    down: string;
    crosshair: string;
    [key: string]: string;
  };
  spacing: {
    barSpacing: number;
    crosshairWidth: number;
    [key: string]: number;
  };
}

const DARK_THEME: Theme = {
  name: 'dark',
  colors: {
    bg: '#1a1a1a',
    text: '#d1d5db',
    grid: '#2d3748',
    up: '#f6465d',
    down: '#00d4ff',
    crosshair: '#8b9dc4'
  },
  spacing: {
    barSpacing: 7,
    crosshairWidth: 1
  }
};

const LIGHT_THEME: Theme = {
  name: 'light',
  colors: { /* ... */ },
  spacing: { /* ... */ }
};

// 主题管理器
class ThemeManager {
  private currentTheme: Theme = DARK_THEME;
  
  apply(themeName: string): void;
  createCustomTheme(config: Partial<Theme>): Theme;
  exportTheme(): Theme;
  importTheme(json: string): void;
}
```

---

### Module 4: Export System（导出系统）

```typescript
// src/exporters/index.ts

interface ExportOptions {
  format: 'png' | 'svg' | 'csv' | 'json';
  quality?: number;     // 1-100
  includeLegend?: boolean;
  width?: number;
  height?: number;
}

class ExportManager {
  // 导出为图片
  async toImage(chart: IChartApi, options: ExportOptions): Promise<Blob>;
  
  // 导出为 CSV
  toCSV(bars: Candle[], indicators: IndicatorData[]): Promise<string>;
  
  // 导出为 JSON (完整状态)
  toJSON(chart: IChartApi, state: ChartState): object;
  
  // 打印图表
  print(chart: IChartApi): void;
}
```

---

## 3. 升级路径

### Phase 1: 数据层封装（2 周）

**任务清单：**
- [ ] 创建 `src/data` 目录结构
- [ ] 实现 REST API Manager
- [ ] 实现 WebSocket Manager
- [ ] 实现 Cache Manager
- [ ] 实现 Data Aggregator
- [ ] 添加单元测试
- [ ] 编写 API 文档

**里程碑：**
✅ 数据供应完全独立，不依赖外部状态管理  
✅ 支持多种数据源切换（Binance/Coinbase/模拟）

### Phase 2: 插件系统（1 周）

**任务清单：**
- [ ] 定义插件接口
- [ ] 实现 Plugin Manager
- [ ] 创建基础插件模板
- [ ] 迁移现有指标到插件模式

**里程碑：**
✅ 用户可以自定义和安装插件  
✅ 指标体系完全解耦

### Phase 3: 主题系统（1 周）

**任务清单：**
- [ ] 定义主题接口
- [ ] 实现 Theme Manager
- [ ] 创建预置主题
- [ ] 支持主题导入导出

**里程碑：**
✅ 用户可以自定义配色方案  
✅ 一键切换主题

### Phase 4: 导出系统（1 周）

**任务清单：**
- [ ] 实现 PNG/SVG 导出
- [ ] 实现 CSV/JSON 导出
- [ ] 添加到组件 API

**里程碑：**
✅ 用户可以导出图表和数据  
✅ 支持打印功能

---

## 4. API 改进

### 旧版本（当前）

```tsx
<ApexChart />
// 需要全局 Zustand store
// 硬编码配置
```

### 新版本（计划中）

```tsx
import { ApexChart, BinanceData, DarkTheme, VolumeProfile } from 'apex-engine';

// 方案 A: 完全独立
<ApexChart 
  symbol="BTCUSDT"
  providers={{ 
    rest: new BinanceRest(),
    ws: new BinanceWS(),
    cache: new LocalStorageCache()
  }}
  theme={DarkTheme}
  plugins={[VolumeProfile]}
/>

// 方案 B: 简单配置
<ApexChart 
  symbol="ETHUSDT"
  interval="1h"
  theme="custom-light"
  indicators={['MA', 'RSI']}
/>

// 方案 C: 手动控制
const chartRef = useRef<IChartApi>(null);
const <ApexChart 
  ref={chartRef}
  onLoad={(api) => console.log(api)}
/>
<button onClick={() => chartRef.current.takeScreenshot()}>截图</button>
```

---

## 5. 性能优化

### 缓存策略

```typescript
// 三层缓存架构
L1: MemoryCache (最近访问的 100 条)
L2: IndexedDB (完整历史记录)
L3: CDN/Proxy (全局共享缓存)
```

### 懒加载策略

```typescript
// 按需加载指标
const MAIndicator = lazy(() => import('plugins/MA'));
const RSIIndicator = lazy(() => import('plugins/RSI'));

<ApexChart
  indicators={['MA', 'RSI'].map(kind => ({
    load: () => import(`plugins/${kind}`),
    visible: true
  }))}
/>
```

### 虚拟滚动

```typescript
// 只显示可见范围的 K 线
const viewportStart = 1000;
const viewportEnd = 1500;

<ApexChart
  dataProvider={{
    getVisibleBars: (start: number, end: number) => {
      return cache.slice(viewportStart, viewportEnd);
    }
  }}
/>
```

---

## 6. 测试策略

### Unit Tests

```typescript
// tests/rest-api.test.ts
describe('RestApiManager', () => {
  it('should fetch klines successfully', async () => {
    const api = new RestApiManager({ /* ... */ });
    const bars = await api.fetchKlines({ symbol: 'BTCUSDT', interval: '1h' });
    expect(bars.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
// tests/integration.test.ts
describe('ApexChart integration', () => {
  it('should load and display data', async () => {
    const { container } = render(<ApexChart symbol="BTCUSDT" />);
    await waitFor(() => expect(container.querySelector('.chart')).toBeInTheDocument());
  });
});
```

### E2E Tests

```typescript
// tests/e2e/chart-interaction.spec.ts
test('user can pan and zoom chart', async () => {
  await page.goto('/demo');
  await page.click('[data-testid="pan-right"]');
  await expect(page).toHaveScreenshot();
});
```

---

## 7. 发布计划

### v1.0.0 (当前) - 独立组件
- ✅ ApexChart 基本组件
- ✅ Props-based API
- ✅ 基础文档

### v2.0.0 (计划) - 完整数据层
- 🔄 REST API Manager
- 🔄 WebSocket Manager
- 🔄 Cache Manager
- 🔄 Default Data Provider

### v3.0.0 (计划) - 插件化
- 📦 Plugin System
- 📦 Custom Indicators
- 📦 Theme System

### v4.0.0 (计划) - 企业级
- 🚀 Export System
- 🚀 Performance Monitoring
- 🚀 Advanced Analytics

---

## 8. 收益分析

| 方面 | 改进前 | 改进后 |
|------|--------|---------|
| **可用性** | 仅能在 Terminal 中使用 | 任何场景独立使用 |
| **数据供应** | 强依赖后端 API | 可自定义任意数据源 |
| **扩展性** | 需修改源码 | 插件化无侵入扩展 |
| **维护成本** | 高耦合难维护 | 模块化易维护 |
| **学习曲线** | 复杂 | 简单（Props 驱动） |
| **性能** | 良好 | 优秀（多层缓存 + 懒加载） |

---

## 总结

这个架构升级方案将 ApexChart 从**一个内部组件**转变为**专业的开源图表库**：

1. ✅ **数据层完全封装** - 后端细节对用户透明
2. ✅ **插件化架构** - 无限扩展能力
3. ✅ **零配置启动** - 开箱即用
4. ✅ **渐进式定制** - Props + Plugins 组合
5. ✅ **企业级功能** - 主题、导出、监控

实施周期约 **5 周**，可逐步交付价值。优先完成**Phase 1 数据层封装**即可大幅提升用户体验。
