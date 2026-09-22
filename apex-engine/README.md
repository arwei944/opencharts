# ApexChart - 开箱即用的专业 K 线图表组件

基于 TradingView lightweight-charts 打造的专业级加密货币 K 线图表组件，支持零配置即用和渐进式定制。

## ✨ 特性

- 🚀 **零配置启动** - 无需任何设置即可使用
- 💪 **高性能渲染** - 100k 根 K 线丝滑滚动
- 🎨 **深色/浅色主题** - 一键切换
- 📊 **多指标支持** - MA、RSI、MACD、BOLL 等
- 🖌️ **画线工具** - 趋势线、水平线、矩形等
- 📱 **响应式布局** - 自适应各种屏幕尺寸
- 🔌 **数据供应灵活** - 可自定义 API 或静态数据
- 🛠️ **类型安全** - 完整的 TypeScript 支持

## 📦 安装

```bash
npm install apex-engine
# 或直接使用源代码中的 components 目录
```

## 🎯 快速开始

### 基础用法 - 零配置即用

```tsx
import { ApexChart } from "apex-engine";

function MyComponent() {
  return (
    <div className="h-[600px] w-full">
      <ApexChart />
    </div>
  );
}
```

### 自定义配置

```tsx
import { ApexChart } from "apex-engine";

function MyChart() {
  return (
    <ApexChart
      symbol="ETHUSDT"          // 标的
      interval="1h"              // 周期
      theme="light"              // 主题
      indicators={[             // 初始指标
        { kind: "MA", params: [9, 25] },
        { kind: "RSI", params: [14] }
      ]}
    />
  );
}
```

### 带真实数据源

```tsx
import { ApexChart } from "apex-engine";

async function fetchKlines(symbol: string, interval: string) {
  const res = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}`);
  return res.json();
}

function ProfessionalChart() {
  return (
    <ApexChart
      symbol="BTCUSDT"
      dataProvider={{
        getBars: fetchKlines,
        subscribeTick: (symbol, market, callback) => {
          // WebSocket 连接示例
          const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            callback({
              time: data.e / 1000,
              open: parseFloat(data.o),
              high: parseFloat(data.h),
              low: parseFloat(data.l),
              close: parseFloat(c),
              volume: parseFloat(data.v),
            });
          };
          return () => ws.close();
        }
      }}
    />
  );
}
```

## 📖 API 文档

### ApexChartOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `symbol` | `string` | `"BTCUSDT"` | 交易对符号 |
| `market` | `"spot"\|"future"` | `"spot"` | 市场类型 |
| `interval` | `Interval` | `"15m"` | K 线周期 |
| `chartType` | `ChartType` | `"candle"` | K 线类型 |
| `invert` | `boolean` | `false` | 反转涨跌颜色 |
| `logScale` | `boolean` | `false` | 对数坐标 |
| `showVol` | `boolean` | `true` | 显示成交量 |
| `theme` | `"dark"\|"light"` | `"dark"` | 主题模式 |
| `settings` | `Partial<ChartSettings>` | `DEFAULT_SETTINGS` | 图表配置 |
| `indicators` | `IndicatorInst[]` | `[MA, VOL]` | 默认指标 |
| `dataProvider` | `object` | `undefined` | 数据供应器 |
| `onLoad` | `(api) => void` | `undefined` | 加载回调 |
| `onError` | `(error) => void` | `undefined` | 错误处理 |
| `containerClassName` | `string` | `""` | 容器类名 |
| `style` | `CSSProperties` | `{}` | 自定义样式 |

### ChartSettings

所有硬编码像素值均可配置：

```typescript
interface ChartSettings {
  crosshairWidth: number;           // 十字线宽度 (1-3)
  crosshairMarkerSize: number;      // 十字线标记大小
  crosshairLabelBg: string;         // 十字线标签背景色
  barSpacing: number;               // 柱间距像素 (2-20)
  timeRightOffset: number;          // 时间轴右侧偏移 (0-50)
  priceScaleMargins: [number, number]; // 价格轴边距 [top, bottom]
  volumeHeight: number;             // 成交量面板高度比例 (0.6-0.95)
  lineWidths: Record<string, number>;   // 各类线条宽度
  crosshairLineStyle: 0\|1\|2\|3;     // 十字线样式
}
```

### DataProvider

```typescript
interface DataProvider {
  /** 获取历史 K 线数据 */
  getBars: (symbol: string, market: Market, interval: Interval, count?: number) => Promise<Candle[]>;
  
  /** 订阅实时 tick（可选） */
  subscribeTick?: (
    symbol: string, 
    market: Market, 
    callback: (tick: Candle) => void
  ) => () => void; // 返回取消订阅函数
}
```

## 🎨 完整示例

参考以下文件查看完整示例：

- `src/components/examples/BasicExample.tsx` - 基础用法
- `src/components/examples/AdvancedExample.tsx` - 进阶用法

## 🔧 高级用法

### 自定义主题

通过 CSS 变量控制主题色：

```css
.apex-chart-container {
  --apex-bg: #1a1a1a;
  --apex-text: #d1d5db;
  --apex-up: #f6465d;
  --apex-down: #00d4ff;
}
```

### 事件监听

```tsx
<ApexChart
  onLoad={(api) => {
    console.log("图表已加载");
    api.subscribeCrosshairMove((param) => {
      console.log("十字线移动", param);
    });
  }}
  onSymbolChange={(symbol) => {
    console.log("标的切换", symbol);
  }}
/>
```

### 截图导出

```tsx
const handleExport = () => {
  const canvas = chartApi.takeScreenshot();
  const link = document.createElement('a');
  link.download = 'chart.png';
  link.href = canvas.toDataURL();
  link.click();
};
```

## 📝 性能优化建议

1. **大数据量**: 使用 `dataProvider.getBars(count)` 限制加载数量
2. **虚拟滚动**: 只显示可见范围的 K 线
3. **按需加载**: 仅初始化需要的指标
4. **防抖节流**: 频繁更新的 tick 数据做节流处理

## 🩺 引擎遥测（DEV）

架构层透明化：引擎的全链路决策与性能指标实时可查。

```js
// 结构化 op-log（环形 500 条）：commitDecide / commit / tail / queueJob
window.__chartTelemetry.snapshot()

// 性能分位数（avg / P50 / P95，窗口 200 采样）：提交耗时 / tick 尾段 / 渲染帧
window.__chartPerf.commitPerf.snapshot()
window.__chartPerf.tailPerf.snapshot()
window.__chartPerf.jobPerf.snapshot()
```

健康面板同时展示引擎性能（avg/P95）与最近 op-log；数据血统（WS/REST/缓存/OKX
来源构成）在同一面板可查。

## 🐛 常见问题

**Q: 如何隐藏某个指标？**

A: 在 indicators 数组中设置 `visible: false`

```tsx
<ApexChart
  indicators={[
    { kind: "MA", params: [9], visible: true },
    { kind: "RSI", params: [14], visible: false }
  ]}
/>
```

**Q: 如何切换到分时图？**

A: 修改 `chartType` 属性：

```tsx
<ApexChart chartType="line" />
```

**Q: 如何禁用十字线同步？**

A: 当前版本暂未支持，可通过 fork 组件移除联动逻辑

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License

---

**注意**: 这是一个生产级别的组件库，持续迭代中。更多功能待添加...
