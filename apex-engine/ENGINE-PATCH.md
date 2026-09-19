# Apex 图表引擎层补丁

相对原项目新增/修改：

新增
- src/lib/market/history.ts        视口左缘分页回溯
- src/components/terminal/ChartBoard.tsx  1 / 1x2 / 2x1 / 2x2 多图

修改
- src/lib/market/types.ts
- src/lib/market/constants.ts
- src/lib/market/api.ts            kline 支持 endTime/limit
- src/lib/market/store.ts          layout / panes / compare / sync
- src/lib/market/chart-engine.ts   增量指标、对比轴、时间轴/光标 API
- src/lib/market/feed.ts           多周期 + 对比标的 WS
- src/components/terminal/ChartPane.tsx
- src/components/terminal/ChartToolbar.tsx
- src/components/terminal/Terminal.tsx

不含 node_modules。在项目根目录：

    npm install
    npm run dev

工具栏：布局 1/1×2/2×1/2×2、轴同步、光标同步、对比输入框。
向左拖 K 线加载更早历史。
