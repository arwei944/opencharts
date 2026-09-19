# 倒垂模式（价格轴翻转）

## 是什么

对齐币安 / TradingView 的 "Invert Scale"（反转价格轴）：整张图上下翻转，高价落在屏幕下方、
低价在上方，**坐标轴读数仍是真实价格**。K 线与叠加指标一起翻，成交量保持贴底。

## 关键事实

lightweight-charts 原生支持，选项是 `PriceScaleOptions.invertScale`（本仓库锁的 5.2.1 有，
`node_modules/lightweight-charts/dist/typings.d.ts` 里能查到）。

此前那版实现（`chart-inverter.ts` / `ChartEngine.setInvertedPriceAxis`）断言"lightweight-charts
不支持 Y 轴镜像"，于是用改 `scaleMargins` + `timeVisible` 来"模拟"倒垂 —— 那个前提就是错的，
而且 `timeVisible` 根本不是标尺选项，代码也编译不过。两个假模块已移入 `.trash/`。

## 实现

| 位置 | 作用 |
|------|------|
| `ChartEngine.setMirror(v)` / `isMirrored` | 开关，落到 `invertScale` |
| `ChartEngine.syncMirror()` | 把当前朝向铺到**每个 pane 的 right + left 标尺** |
| `store.mirrorAxis` + `toggleMirrorAxis` | 状态源，随 `apex-desk` 一起持久化 |
| `ChartPane` 的 `useEffect([mirrorAxis])` | 与 `setInvert` / `setLog` 同一套驱动方式 |
| `InvertedViewToggle` | 工具栏按钮，读 store，不再持有本地 state |

三个不显然的点：

1. **`invertScale` 是"每条标尺"的属性，不是图表的。** 主图、每个副图 pane、对比线的 left
   标尺各有一份，所以要遍历 `chart.panes()` 逐条下命令。
2. **pane 和标尺是随系列创建才出现的。** 指标线会新建副图 pane，对比线会新建 left 标尺；
   新来的那些带着默认（未翻转）配置。所以 `rebuildMain` / `syncLeftScale` / 每个 `runRest`
   job 之后都要 `syncMirror()` 补一次 —— 否则"先开倒垂、后加载指标"会有一半画面偷偷正回来。
3. **状态必须放 store，不能放组件本地 state。** ChartEngine 在 pane 重挂载和 HMR 时会重建，
   本地状态活得比引擎久，就会出现"按钮显示倒垂、画面是正的"。

成交量走独立的 `vol` 标尺，故意为之不翻，始终贴底 —— 与币安 / TradingView 一致。
颜色（`invert`，红涨绿跌）与几何（`mirrorAxis`）互不干涉，是两个独立开关。

## 验证（headless，:8080 + Chromium）

BTCUSDT / 15m，等历史补齐到 105,000 根后再测，避免 commit 改自动缩放污染量具。

- 每列彩色像素的平均高度，倒垂 vs 正视图 **r = -0.644**（真翻转）；关掉后 vs 最初正视图
  **r = 1.000**（可逆，且量具可信）。
- 轴读数：顶部 ~77,000、底部 ~82,000，十字光标标签同样读真实价格。
- 副图 RSI 在两种顺序下都跟着翻：先加指标后开倒垂、先开倒垂后加指标（覆盖 pane 新建路径）。
- 画线往返：在 pane 内 y=120 落点，SVG 水平线画在 `y1 = 119.99999999999993`。
- 刷新后状态保留（zustand persist）。
- 控制台无 error / pageerror。
