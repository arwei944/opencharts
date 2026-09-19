# ApexChart 使用指南

## 📚 目录结构

```
apex-engine/
├── src/
│   ├── components/
│   │   ├── ApexChart.tsx              # 核心组件
│   │   ├── index.ts                   # 统一导出
│   │   ├── examples/                  # 使用示例
│   │   │   ├── BasicExample.tsx
│   │   │   └── AdvancedExample.tsx
│   │   └── terminal/                  # 终端子组件
│   │       ├── ChartToolbar.tsx
│   │       ├── SettingsModal.tsx
│   │       ├── IndicatorModal.tsx
│   │       └── SymbolSearch.tsx
│   └── lib/market/                    # 核心逻辑
│       ├── chart-engine.ts           # 图表引擎
│       ├── store.ts                  # 状态管理
│       ├── settings.ts               # 配置定义
│       └── types.ts                  # 类型定义
```

## 🎯 完整使用流程

### Step 1: 导入组件

```tsx
import { ApexChart } from "apex-engine";
```

### Step 2: 创建容器

```tsx
<div className="h-[600px] w-full border rounded-lg overflow-hidden">
  <ApexChart />
</div>
```

### Step 3: 可选 - 自定义配置

```tsx
<ApexChart
  symbol="BTCUSDT"          // 标的
  interval="15m"            // 周期
  theme="dark"              // 主题
  settings={customSettings} // 自定义设置
/>
```

## 💡 实际项目中的应用

### React 项目

```tsx
// App.tsx
import React, { useState } from 'react';
import { ApexChart } from 'apex-engine';

function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  
  return (
    <div className="App">
      <header>我的交易终端</header>
      
      <main>
        <ApexChart 
          symbol={symbol}
          onSymbolChange={(newSymbol) => {
            console.log(`切换到 ${newSymbol}`);
            setSymbol(newSymbol);
          }}
        />
        
        <aside>
          <button onClick={() => setSymbol('ETHUSDT')}>
            切换到 ETH
          </button>
        </aside>
      </main>
    </div>
  );
}
```

### Next.js 项目

```tsx
// pages/chart.tsx
import { ApexChart } from 'apex-engine';

export default function ChartPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">K 线图表</h1>
      <div className="h-[700px]">
        <ApexChart symbol="BTCUSDT" interval="1h" />
      </div>
    </div>
  );
}
```

### Vue 项目（通过 react-dom渲染）

```vue
<template>
  <div class="chart-container">
    <ReactRenderer component="<ApexChart symbol='ETHUSDT' />" />
  </div>
</template>
```

## 🔍 API 详解

### 基础属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `symbol` | `string` | `"BTCUSDT"` | 交易对，如 BTCUSDT、ETHUSDT |
| `market` | `"spot"\|"future"` | `"spot"` | 现货或合约 |
| `interval` | `Interval` | `"15m"` | 周期：1s, 1m, 5m, 15m, 1h, 4h, 1d 等 |
| `chartType` | `ChartType` | `"candle"` | 类型：candle, line, area, bar, hollow |

### 显示控制

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `invert` | `boolean` | `false` | 红涨绿跌还是绿涨红跌 |
| `logScale` | `boolean` | `false` | 对数坐标，适合长线分析 |
| `showVol` | `boolean` | `true` | 是否显示成交量面板 |
| `theme` | `"dark"\|"light"` | `"dark"` | 深色或浅色主题 |

### 样式定制

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `settings` | `Partial<ChartSettings>` | `DEFAULT_SETTINGS` | 详细配置见下方 |
| `containerClassName` | `string` | `""` | CSS 类名 |
| `style` | `CSSProperties` | `{}` | 内联样式 |
| `containerId` | `string` | `"apex-chart-{timestamp}"` | DOM ID |

### 指标系统

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `indicators` | `IndicatorInst[]` | `[MA(7,25), VOL]` | 初始指标列表 |

支持指标类型：
- `MA` - 简单移动平均线
- `EMA` - 指数移动平均线
- `BOLL` - 布林带
- `RSI` - 相对强弱指数
- `MACD` - 平滑异同移动平均线
- `KDJ` - 随机指标
- `STOCH` - 随机振荡器
- `WR` - 威廉指标
- `CCI` - 商品路径指数
- `OBV` - 能量潮
- `ATR` - 平均真实波动范围
- `SAR` - 抛物线转向
- `SUPER` - 超级趋势
- `VWAP` - 成交量加权平均价

### 数据供应

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataProvider` | `object` | 否 | 数据提供者 |
| `dataProvider.getBars` | `function` | 否 | 获取历史 K 线 |
| `dataProvider.subscribeTick` | `function` | 否 | 订阅实时 tick |

#### getBars 函数签名

```typescript
type GetBars = (
  symbol: string,
  market: Market,
  interval: Interval,
  count?: number
) => Promise<Candle[]>;
```

返回格式：
```typescript
interface Candle {
  time: number;           // Unix 时间戳（秒）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

#### subscribeTick 函数签名

```typescript
type SubscribeTick = (
  symbol: string,
  market: Market,
  callback: (tick: Candle) => void
) => () => void; // 取消订阅函数
```

### 回调事件

| 属性 | 类型 | 说明 |
|------|------|------|
| `onLoad` | `(api: IChartApi) => void` | 图表加载完成 |
| `onDestroy` | `() => void` | 图表销毁时 |
| `onSymbolChange` | `(symbol: string, market: Market) => void` | 标的切换 |
| `onIntervalChange` | `(interval: Interval) => void` | 周期切换 |
| `onChartTypeChange` | `(type: ChartType) => void` | 图类型切换 |
| `onError` | `(error: Error) => void` | 错误处理 |

## 🎨 ChartSettings 详细配置

```typescript
interface ChartSettings {
  // 十字线相关
  crosshairWidth: number;           // 十字线宽度：1, 2, 3
  crosshairMarkerSize: number;      // 标记大小：2-8
  crosshairLabelBg: string;         // 标签背景色：'#8b9dc4'
  crosshairLineStyle: 0\|1\|2\|3;   // 样式：隐藏/实线/虚线/点线
  
  // 时间轴
  barSpacing: number;               // 柱间距：2-20px
  timeRightOffset: number;          // 右侧偏移：0-50
  
  // 价格轴
  priceScaleMargins: [number, number]; // 边距比例 [top, bottom]
  
  // 成交量
  volumeHeight: number;             // 高度比例：0.6-0.95
  
  // 颜色
  compareColors: string[];          // 对比品种颜色
  
  // 线条宽度
  lineWidths: Record<string, number>;  // MA:1, RSI:1, etc.
}
```

## 📊 性能最佳实践

### 1. 限制历史数据量

```tsx
<ApexChart
  dataProvider={{
    getBars: async (symbol, market, interval, count = 500) => {
      // 只请求 500 根，避免一次性加载过多
      const res = await fetch(`/api/klines?count=${count}`);
      return res.json();
    }
  }}
/>
```

### 2. 按需加载指标

```tsx
const [indicators, setIndicators] = useState([
  { kind: "MA", params: [9], visible: true }
]);

<ApexChart
  indicators={indicators}
  onAddIndicator={(kind) => {
    setIndicators(prev => [...prev, { kind, params: [], visible: true }]);
  }}
/>
```

### 3. 防抖实时数据

```tsx
import { debounce } from 'lodash';

<ApexChart
  dataProvider={{
    subscribeTick: (symbol, market, callback) => {
      const debouncedCallback = debounce(callback, 100);
      ws.onmessage = (event) => debouncedCallback(parseKline(event.data));
      return () => ws.close();
    }
  }}
/>
```

## 🐛 调试技巧

### 查看图表状态

```tsx
const chartRef = useRef<IChartApi>(null);

<ApexChart
  onLoad={(api) => {
    chartRef.current = api;
    console.log('Chart API:', api);
    console.log('Visible range:', api.timeScale().getVisibleRange());
  }}
/>
```

### 捕获错误

```tsx
<ApexChart
  onError={(error) => {
    console.error('Chart error:', error.message);
    alert(`图表错误：${error.message}`);
  }}
/>
```

## 🔄 升级指南

从旧版本迁移：

1. **移除全局状态依赖** - 不再依赖 Zustand store，改用 props
2. **更新类型定义** - 使用新的 `ApexChartOptions` 接口
3. **重构数据供应** - 改用 `dataProvider` 模式

```tsx
// Before
const state = useTerminal();
<ChartPane bars={state.bars} />

// After
<ApexChart 
  dataProvider={{ getBars: myFetchFunction }}
  indicators={myIndicators}
/>
```

## 🌟 进阶技巧

### 多图表联动

```tsx
function LinkedCharts() {
  const [syncedTime, setSyncedTime] = useState<number | null>();
  
  return (
    <div className="flex gap-4">
      <ApexChart
        symbol="BTCUSDT"
        onCrosshairMove={(time) => setSyncedTime(time)}
      />
      <ApexChart
        symbol="ETHUSDT"
        syncedTime={syncedTime}
      />
    </div>
  );
}
```

### 自定义绘制叠加层

```tsx
const [overlayData, setOverlayData] = useState([]);

<ApexChart
  dataProvider={{
    subscribeTick: (_, _, callback) => {
      callback((tick) => {
        setOverlayData(prev => [...prev.slice(-50), tick]);
      });
      // WebSocket setup...
    }
  }}
/>

// 在 SVG 上叠加自己的图层
<div className="relative h-[600px]">
  <ApexChart /* ... */ />
  <svg className="absolute inset-0 pointer-events-none">
    {/* 自定义绘制 */}
  </svg>
</div>
```

## 📞 技术支持

遇到问题？请检查：

1. ✅ TypeScript 版本 >= 5.0
2. ✅ React 版本 >= 18.0
3. ✅ lightweight-charts >= 5.0
4. ✅ zustand >= 4.0

仍无法解决？提交 Issue 并提供：
- 代码片段
- 错误信息
- 浏览器控制台日志

---

**提示**: 定期关注官方文档更新，新功能持续添加中！
