# 🔄 倒垂模式（价格轴翻转）修复 + 升级清单

> 基于 Playwright headless 实测（105k bars，BTCUSDT 15m，多次布局/指标/交易对切换）。
> 分支 `cleanup/slim-down`，当前实现基于 lightweight-charts 原生 `invertScale`。

---

## 一、实测结论：核心翻转全部正常 ✅

| 场景 | 结果 |
|------|------|
| 主图 K 线翻转（高价在下、低价在上） | ✅ `invertScale=true`，像素验证 y 均值 113 → 339（上下镜像） |
| 指标副图 pane（RSI/MACD）翻转 | ✅ 每个 pane 的 right/left 标尺都翻转 |
| 对比线（left 标尺）翻转 | ✅ |
| 先开倒垂 → 后加指标 | ✅ 新 pane 进场后 `syncMirror()` 补翻 |
| 先加指标 → 后开倒垂 | ✅ |
| 2x1 / 多 pane 布局 | ✅ 所有引擎 mirror 同步，切换 symbol/布局后保持 |
| log 对数刻度 + 倒垂 | ✅ 共存 |
| invert（红绿互换）+ 倒垂 | ✅ 独立组合，关闭后全部还原 |
| 坐标 round-trip（y→price→y） | ✅ 误差 < 1e-12 |
| 成交量 | ✅ 独立 vol 标尺不翻、保持贴底（币安/TradingView 一致） |
| 引擎生命周期 | ✅ 无泄漏（ghosts=0），布局可逆 |

**结论：没有「点了倒垂画面不翻」这类破坏性 bug。**

---

## 二、需要修复的问题（按优先级）

### 🔴 P1 修复

1. **`DrawingOverlayV2.tsx` 完全未接线（死代码）**
   - 组件定义了 props（drawings/engine/onSelect/onDelete）与完整渲染逻辑（含 `approximateCoordinates` 开发回退），但**全仓库无任何 import/使用**。
   - `ChartPane` 实际用的是内联 `DrawShape`（`ChartPane.tsx:240`）。
   - 处理：**删除**（与旧 `DrawingOverlay.tsx` 同属双轨残留），或若绘图 overlay 需要 v2 交互（选中/删除/拖拽）则接入——推荐删除，当前 DrawShape 已覆盖渲染。

2. **幽灵引擎残留（布局切换时）**
   - 实测 `__chartEngines` 在 2x1 布局下有 3 个引擎（2 live + 1 空 bars=0）。空引擎是布局切换瞬间创建的（`boot()` 时容器尺寸/数据未就绪）。
   - 危害：非 master pane 在布局刚切换时可能短暂空白；`syncMirror` 对空 pane 无操作，一旦数据到达需重新 sync。
   - 处理：ChartPane `boot()` 已在 `setFullData` effect 驱动，空引擎会在数据到达后自愈（实测 i2 引擎 79581 bars 正常渲染）。**建议加防御**：`boot()` 里引擎创建后若 0 数据立即注册一次 `ensureCompleteHistory` 回调，或确认 `ResizeObserver` 逻辑覆盖隐藏→可见场景。

### 🟡 P2 体验升级

3. **倒垂时十字线/图例的「价格读数方向」无提示**
   - 翻转后右侧价格轴读数仍是真实价格（正确），但新用户会困惑为何 K 线倒挂。
   - 升级：Header/工具栏在倒垂激活时显示「倒垂中」状态徽标（`InvertedViewToggle` 已有 gold 高亮，但可在 ChartPane 图例区追加「↕ 倒垂」小标签）。

4. **成交量是否跟随翻转？——增加可配置项**
   - 现状：vol 标尺故意不翻（贴底）。币安/主流一致。
   - 升级：settings 增加 `mirrorVolume` 布尔项（默认 false 保持现状），需要全翻的用户可开启。

5. **`syncMirror()` 覆盖所有标尺的健壮性**
   - 现状：遍历 `panes()` 的 right/left。新增 `vol` 也不翻（有意）。但**自定义指标 script-parser 创建的额外 pane**（`indicator-engine`）在倒垂+动态添加时可能漏翻——实测 RSI/MACD 正常，但 script-parser 的 CUSTOM 指标路径未覆盖测试。
   - 升级：给 `syncMirror` 加日志/断言（dev 模式），或统一在 `setIndicators` 完成后再调一次。

### 🟢 P3 文档与测试

6. **倒垂无自动化测试**
   - 升级：把本轮 headless 验证沉淀为 `scripts/browser-smoke` 风格的测试（价格轴翻转断言、round-trip、多 pane 同步）。

---

## 三、执行建议

```
Step 1  P1-1: 删除 DrawingOverlayV2.tsx（死代码，随清理提交）
Step 2  P1-2: ChartPane boot 防御（空引擎在数据到达时补 syncMirror / ensureCompleteHistory）
Step 3  P2-3: 图例加「倒垂」状态标签（小改）
Step 4  P2-4: settings 增加 mirrorVolume 可选项（中改，需接入 SettingsModal + store + chart-engine）
Step 5  P2-5: syncMirror 对 CUSTOM 指标 pane 的覆盖测试
Step 6  P3-6: 沉淀倒垂回归测试
每步后跑 tsc + dev 冒烟（倒垂开/关 + 指标 + 布局组合）
```

**验收标准**：
- 倒垂开：主图/指标/对比线全翻、成交量贴底、坐标 round-trip 精确
- 倒垂关：全部还原，与未开一致
- 切换 symbol/interval/layout/指标顺序：倒垂状态保持
