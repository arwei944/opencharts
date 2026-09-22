# 🚀 OpenCharts v2.0 大版本升级方案（V3 全盘规划）

> 深度调研后制定。定位：**产品为主轴 + 架构为支撑，分期推进**。
> 目标：把 OpenCharts 从「功能齐全的终端 demo」升级为「对标币安专业图表 / TradingView 核心能力
> 的专业图表产品」，同时完成支撑该目标所需的架构重构。
> 基于当前 main（round-8，`1d66a98`）：src 15.5k 行、107 单测 + CI + 倒垂/像素回归、bundle 258.5kB（预算 260kB）。

---

## 一、本轮深度调研基线（实测数据）

### 1.1 已有能力（无需再做的）

| 领域 | 现状 |
|------|------|
| 指标 | 32 内置（MA/EMA/BOLL/SAR/VWAP/SUPER/ATR/MACD/RSI/KDJ/STOCH/WR/CCI/OBV/DMI/StochRSI/MFI/AROON/TRIX/ROC/MOM/PPO/CMF/WMA/TRIMA/VWMA/NATR/BBW/DPO/TSI/AO）+ 自定义 Pine 脚本 + 指标预置模板 4 组 + 搜索 |
| Pine | 求值器子集：算术/三元/比较/状态变量(var/:=)/历史引用/多 plot/for 循环 + 策略信号序列接回测（`backtestFromSeries`） |
| 绘图 | 12 工具（cursor/cross/order/text/trend/arrow/ray/hline/vline/rect/fib/parallel/measure）、锚点编辑/整体移动/磁吸、undo/redo 栈、对象树（选中/隐藏/锁定/删除）、localStorage 持久化、属性面板（颜色/线宽） |
| 数据 | 多 host 粘性阶梯 + 健康分（Binance）、常驻 OKX kline 副流（真并发双源 + >1% 偏差告警）、IDB typed-array 缓存 + 内存镜像、gap/异常校验、健康面板、CSV/JSON 导出、SW 离线壳 |
| 交易 | Paper / Binance / OKX 三 broker（服务端 HMAC 签名、密钥不进浏览器）、点图下单、TP/SL 图上拖拽、风控（最大持仓/单笔额度）、资金曲线/胜率/盈亏/回撤、多账户快照隔离 |
| 图表 | 6 图表类型免重建切换、16 档周期、多 pane 布局（1/1x2/2x1/2x2）独立周期、多图联动（轴/十字光标）、倒垂（全标尺同步 16 断言回归）、log 刻度、红绿反转、minimap 缩放条、双击缩放、系统主题跟随 |
| 工程 | CI（typecheck+lint+test+build+preview 冒烟）、selectors 层 + memoized ChartPane、in-place 尾段更新（同 bar tick 引用稳定）、窗口化（BAR_CAP 220k / PANE_CAP 12k）、URL search params（symbol/interval/layout/chartType/theme）、Terminal 懒加载、4 主题 token 化、i18n 123 键（zh/en）、时区 Intl formatter（含 DST）、插件注册表（指标/绘图/数据源） |

### 1.2 架构体检（本轮扫描结论）

| 文件 | 行数 | 问题 |
|------|------|------|
| `chart-engine.ts` | **1362** | 单类职责爆炸：生命周期/数据提交/指标管线/事件/绘图坐标/导出/compare 全混一文件。改动风险高、无法单测（DOM 依赖） |
| `store.ts` | **809** | 单 store 混装：行情大数组（bars/paneBars/compareBars 三份）+ UI 开关 + 引擎配置 + 交易状态。selectors 已缓解订阅粒度，但架构仍是「一切皆全局」 |
| `feed.ts` | 478 | 双 socket 池 + OKX 副流正常；REST 初拉与 WS 串行（首屏 ~1s 延迟）；无聚合缓存（同 key 多 pane 重复请求） |
| `indicators.ts` | 751 | 纯函数健康（107 单测覆盖）；全部在主线程计算，220k bars × 多指标时首算卡顿风险 |
| `history.ts` | 405 | 3 年深度（15m），**无无限滚动**（zoom-out 不自动补历史）；IDB 快照全量写回 |
| 内存 | — | BAR_CAP 220k 常驻内存（约 220k×48B≈10MB/序列），无 typed-array 列式存储 |

### 1.3 关键差距（对标顶级图表组件的剩余缺口，按用户可感知价值排序）

1. **历史无限滚动 + 多周期数据级联**（P1）——zoom-out 自动加载更久历史、放大自动补齐，是 TV 的核心体验，当前 3 年封顶
2. **每指标属性弹窗**（P1）——现在只能全局调色，不能给单个 MACD 换色/线宽/样式/可见性
3. **绘图工具 12→30+**（P1）——缺 Gann/艾略特/楔形/旗形/价格范围/文本标签/图标/对称等
4. **完整 Pine v5**（P2→P1 当回测成为卖点）——缺 input/strategy 指令、plotshape/alertcondition、函数库
5. **回测产品化**（P2）——缺参数优化/蒙特卡洛/前向测试/成交明细，报告停留在基础指标
6. **Alerts 提醒系统**（P2，TV 用户粘性核心）——价格/指标交叉提醒 + 通知
7. **K 线回放（replay）**（P2）——复盘/教学场景刚需
8. **订单流数据**（P2，期货用户）——大单热图、清算地图、OI、多空比、资金费率倒计时（有 premium 基础）
9. **对象/布局云端同步**（P2）——localStorage → 云同步 + 多设备
10. **性能纵深**（架构支撑）——指标计算下 worker、数据列式存储、超大序列渲染虚拟化

---

## 二、竞品特性矩阵（对标基准）

| 维度 | TradingView 网页版 | TV Advanced Charts(Library) | 币安专业图表 | Hyperliquid | **OpenCharts 现状** | v2.0 目标 |
|------|------|------|------|------|------|------|
| 指标 | 100+ 内置 + Pine 社区 10 万+ | 同左（商用授权） | ~50 常用 | ~20 | **32 内置 + Pine 子集** | 40+ 内置 + 完整 Pine |
| 绘图 | 30+（Gann/艾略特/ABCD/对称/图标…） | 同左 | ~20 | 基础 | **12** | 24（覆盖高频工具） |
| 历史深度 | 无限滚动（zoom-out 自动加载） | 无限 | 无限 | 无限 | **3 年封顶** | 无限滚动 + 数据级联 |
| 多周期 | 任意窗口内嵌多 TF + 更高 TF 上下文 | 支持 | 布局多图表 | 单一 | **布局 4 pane 独立周期** | 更高 TF 上下文条 + 周期联动 |
| 回测 | 策略测试器（完整报告+参数优化+前向） | 同左 | 无 | 无 | **基础报告（胜率/盈亏/回撤/夏普）** | 完整报告 + 参数优化 |
| 提醒 | 价格/指标 Alert + webhook | 支持 | 价格提醒 | 无 | **无** | 价格/指标/信号 Alert |
| 回放 | Replay 模式 | 支持 | 无 | 无 | **无** | Replay |
| 订单流 | 深度 + 热图（专业版） | — | 大单热图/清算地图/OI/多空比 | DOM ladder | **40 档深度图** | 热图 + OI + 清算 + 资金费率倒计时 |
| 交易 | 仅连接券商 | 无 | 杠杆滑块/margin 模式/TP-SL/策略单/OCO | ladder + 预置单 + 滑点估算 | **三家 broker + TP/SL 拖拽 + 风控** | 杠杆/保证金模式 + OCO + 滑点显示 |
| 同步 | 云端 workspace/布局 | 无 | 账号内 | 无 | **localStorage** | 云同步（可选后端） |
| 性能 | canvas 分片 + 虚拟化 | 同左 | 商用 | 流畅 | **lw-charts 渲染 + 渐进 reveal** | worker 计算 + 列式存储 |
| 扩展 | Pine 市场 | API/事件 | 无 | 无 | **插件注册表（3 类）** | 正式插件 API + 示例 |

---

## 三、v2.0 北极星与验收标准

**北极星**：打开即用、深挖不塌——「核心体验对齐 TV 核心功能，数据永不缺、图表永远流畅、交易能闭环」。

**硬性验收（发布门槛）**：
- 无限滚动：15m 从 3 年延至全部可用历史，zoom-out 自动加载且无白屏/闪烁
- 每指标独立属性（颜色/线宽/样式/可见性/刻度边）
- 绘图工具 ≥ 24 种；新增工具全部支持锚点编辑/undo/持久化
- Pine 支持 input/strategy/plotshape/alertcondition，回测报告 ≥ TV 基础版字段
- Alert 系统：价格/指标交叉提醒，断线重连后恢复
- 性能：100k bars × 6 指标滚动缩放不掉帧（60fps 探针）；指标首次计算 < 50ms（worker 后）
- 架构：chart-engine 拆分后无行为回归（全量回归绿）；store 分层后组件订阅隔离验证
- 工程：单测 ≥ 160、lint/tsc 0、CI 全绿、bundle ≤ 300kB（新增能力需控预算）

---

## 四、分期总览（产品主轴 × 架构支撑）

```
Phase 0  架构地基（先行，~30% 投入）—— 引擎模块化 + store 分层 + 列式数据，为后续功能铺路
Phase 1  图表深度（~40%）—— 无限滚动 + 多周期 + 指标属性 + 绘图扩展 + 更高 TF 上下文
Phase 2  策略与提醒（~20%）—— 完整 Pine + 回测产品化 + Alert 系统 + Replay
Phase 3  交易与生态（~10%）—— 订单流/杠杆模式/OCO + 云端同步 + 插件 API 定型
每期结尾：tsc 0 + lint 0 + 全量回归绿 + 新增验收探针全过 + bundle 预算内
```

> 占比是投入权重：P1 图表深度是用户最可感知的；P0 是它的前提（不拆引擎，无限滚动/指标属性难做稳）。

---

## 五、Phase 0 — 架构地基（先行，风险最高，收益最大）

### P0-A chart-engine 模块化拆分（1362 行 → 6 模块）
| 模块 | 内容 | 说明 |
|------|------|------|
| `engine/indicator-render.ts` | ✅ 已落地：IndicatorRenderer（jobs/applyTail/reset/line/extra 全量迁入，含实时尾值 switch） | engine 委托，全回归无 diff |
| `engine/compare.ts` | ✅ 已落地：CompareManager（set/update/remove/clear/apply/syncScale） | 见上一轮 |
| `engine/export.ts` | ✅ 已落地：截图 + 坐标 round-trip 纯函数 | 见上一轮 |
| `engine/viewport.ts` | ✅ 已落地：fitRange/zoomRange/isValidRange 纯函数（5 单测），engine 方法接管 | 本轮 |
| `engine/data-pipeline.ts` | ✅ 已落地：decideCommit 纯决策（noop/schedule/tail/park/commit，6 单测），setFullData 全量接管 | 本轮，core 决策层 |
| `engine/rest-queue.ts` | ✅ 已落地：RestQueue 一帧一个 setData 调度队列（refill/prepend/pump/cancel） | 本轮，core 调度层 |
| `engine/core.ts` | 剩余薄层：commit/applyTail/pushIndTail/updateSeriesBar/updateLastBar（副作用） | 已足够薄，可与 events 合并收尾 |
| `engine/events.ts` | ✅ 已落地（纯函数层）：dragDelta/panRange/clampPanSensitivity（4 单测）；指针状态（interacting/dragging）与渲染管线共享故保持内聚，拆分会把状态引用扩散到 8 处 | 本轮收尾 |
| `chart-engine.ts` | 组合层 + 对外门面 | 1362 → 966 行，P0-A 收官 ✅ |

**验收**：拆分后跑通全量回归（含倒垂 16 断言、像素 4 主题、batch1-12 冒烟），无行为 diff。

### P0-B store 分层（809 行 → slices 重组）✅ 已落地
| slice | 内容 | persist |
|------|------|------|
| `stores/config-slice.ts` (383 行) | symbol/interval/layout/chartType/theme/indicators/drawings/undo/chartSettings/brokerMode/tpsl/面板折叠/compareSymbols/sync* | ✅ partialize 只存此层 + version2/migrate（旧 apex-desk 兼容） |
| `stores/market-slice.ts` (262 行) | bars/paneBars/compareBars/ticker/book/trades/watch/historyStatus/okx 双源/溢价 | ❌ 高频永不持久化 |
| `stores/ui-slice.ts` (68 行) | 弹窗开关/tool/mobileTab | ❌ |
| `stores/trading-slice.ts` (42 行) | 点图下单价/feedStats/overlay | ❌ |
| `store.ts` (99 行) | 组合层 `create<TerminalState>()(persist(...))`，`useTerminal` 单出口零组件改动 + window 调试暴露恢复 | |

**关键动作（全部完成）**：persist `version: 2` + `migrate`（theme 不入存储、panes 归一化、旧数据合并到 DEFAULT_SETTINGS）；partialize 只持久化配置层（bars/ticker 永不落盘）；高频路径继续 in-place 尾段更新（updateBar 同 bar 原地改引用）；selectors.ts 补全高频订阅具名导出（paneBars/compareBars/book/trades/watch/dataWarnings/okx 等，9 组 hook）。

> 决策记录：未拆成 3 个独立 zustand store——zustand 的 selector 订阅已天然隔离渲染（`useTerminal(s => s.x)` 只在 x 变化时重渲染），且跨层 action（setSymbol 清 bars、setLayout 裁 paneBars）在独立 store 间会引入新复杂度；slices 模式达到分层组织的全部收益，外部 29 个调用文件零改动。与 events 模块同理（见 P0-A）。

### P0-C 数据存储列式化（性能地基）✅ 基础层已落地
- `columns.ts`：CandleColumns 契约（Int32 times + 5×Float64）+ `colsOf/barsOf/concatCols/trimCols/cloneCols` 纯函数（8 单测：round-trip/头部拼接/裁剪/克隆隔离）
- `kline-cache.ts` 重构：KlineCacheRecord 改为 `extends CandleColumns`；encodeBars=colsOf、decodeBars=barsOf、appendKlineCache 的 typed-array splice 抽为 concatCols——缓存编码逻辑单源化
- **决策记录**：store 驻留 bars 不列式化——zustand 的 in-place 尾段更新（updateBar 同 bar 原地改引用）+ prependBars 裁剪依赖对象数组的引用稳定性与可变性，列式驻留会破坏这两个性能优化；列式作为 I/O 与缓存层交换格式。指标列式重载（indicators.ts 全量翻新）留待 P1 性能探针不达标时再做（33 个指标逐个改造成本高、收益集中在大数组首次计算，且 render.jobs 已逐帧摊平）。

### P0-D 指标计算下 Worker（可选，与 P0-C 解耦）
- `indicator-worker.ts`：接收 (kind, params, columns) → 返回 Line[]；主线程空闲时预计算，结果缓存 key 化
- 优先级：P0 不做也不阻塞；P1 引入（配合多指标场景）

---

## 六、Phase 1 — 图表深度（用户可感知核心）

### P1-A 无限历史滚动 + 多周期数据级联
**无限滚动（✅ 已闭环，`aabf2c0`）**：extendHistory 机制上一启动批次已落地，本轮修通三个堵点并实测生效：
- `minBarSpacing` 0.5px → 0.001（0.01 仍 clamp 在 ~viewport/0.0114；0.001 达 bar0）——否则 10 万根序列永远无法全览，视口到不了已加载最左，coverage 永不触发
- `fit()`：setVisibleLogicalRange 有 ~710 根余量 clamp，且 lw 首次 fitContent 有 ~714 根余量 → 跨帧二次 fitContent 达真前沿（幂等）
- `extendHistory` 边界 `>=` → `<`（视口贴住最左也要扩展）+ runExtend 不再把 phase 改回 prefill（否则 ChartPane 重新冻结、扩展数据全部 park 不渲染），保持 complete 只动进度字段
- 实测：fit 后 45s 驻留 bars 105000→109000（+4000），oldest 提前 ~42 天，phase complete、pending null
**更高 TF 上下文条（✅ 已落地，本轮）**：HTFBar 组件——图表上方细条，当前周期的后 3 档更高周期各 60 根迷你蜡烛（SVG），主图可见窗口高亮（overlapRange 纯函数，3% 阈值节流避免拖拽重渲染），点击段切换主图周期（实测 15m→1h 联动）；数据独立轻量订阅，不占用驻留窗口预算；htf.ts 纯函数 6 单测
**多周期数据级联（⏳ 未做）**：主图/副图周期联动已有 linkedRange；「zoom-out 自动降采样/更高分辨率自动加载」留 P1 后续轮

### P1-B 每指标属性弹窗
- `IndicatorInst` 扩展：`color?/width?/style?/scale?("right"|"left"|"overlay")/visible` 已是 visible
- IndicatorModal 的编辑态升级为属性面板：参数 + 颜色（色板）/线宽/线型/刻度边/可见性切换
- chart-engine 应用属性：setIndicators 时逐线应用（lw-charts line color/width/lineStyle）；undo 兼容（pushHistory）

### P1-C 绘图工具 12 → 24（✅ 12→20，本轮）
落地 8 个高频几何工具（全部复用锚点编辑/吸附/undo/持久化管线）：**price-range（价格区间带）、fib-ext（斐波那契扩展 0.618/1/1.618）、fib-time-zone（单点斐波那契时间竖线）、ellipse（椭圆）、gann-fan（7 线江恩扇）、wedge（楔形，3 点派生下轨）、pitchfork（安德鲁音叉，3 点中线+上下轨）、symmetry（对称，3 点镜面线）**。点数交互改查表（POINT_NEED：3 点工具 wedge/pitchfork/symmetry/parallel，单点 fib-time-zone 走 hline/vline 分支）；SVG 渲染实测注入 8 工具无 pageerror、drawingCount 8、工具栏 20 按钮。
- 未做（P2）：gann-box/abcd/flag/text-box/label/icon、measure 角度显示——纹理类/多点形态工具
### P1-D 主题/刻度增强（✅ 网格线型，本轮）
- ChartSettings 增 `gridLineStyle`（0 实线/1 点线/2 虚线/3 粗虚线），createChart + setTheme + applyTypography 三处即时应用（改设置实时生效）；CrosshairSection 增选择器
- 未做（P2）：刻度内外位置（lw-charts 无原生支持，需自定义 tick 层）

---

## 七、Phase 2 — 策略与提醒

### P2-A 完整 Pine v5 子集（升级求值器）
| 缺失 | 方案 |
|------|------|
| `input.*`（int/float/bool/string/color/session） | 解析器 + 属性面板渲染输入项 |
| `strategy()` 指令 | 解析 `strategy.entry/exit/close` → 直接驱动 backtest 引擎（替代现在的「Signal 输出→序列」间接路径） |
| `plotshape/plotchar/plotarrow/alertcondition` | 渲染到图表（shape 层）+ 接入 Alert 系统 |
| 内置函数库扩展 | `highest/lowest/sum/hhv/llv/crossover/crossunder/barssince/...` 常用 20+ |
| `ta.*` 命名空间别名 | 兼容 TV 脚本（`ta.sma` 等） |

### P2-B 回测产品化
- 报告增强：Profit Factor / 恢复因子 / Sortino / 交易次数分布 / 月度收益热力图 / 逐笔成交表（时间/价格/盈亏/持仓时长）
- 参数优化：网格扫描（策略参数 × 区间 × 滑点），输出最优参数 + 等值线热图；**worker 并行**（多参数组合独立计算）
- 前向测试：replay 引擎驱动（与 P2-D 共享）
- 滑点/手续费模型：maker/taker 费率可配（对接 broker 真实费率）

### P2-C Alert 提醒系统
- 类型：价格触达（上下/区间）、指标交叉（MA/RSI/MACD 等）、Pine alertcondition
- 实现：纯前端引擎（WS 驱动，每 bar 闭市 + 实时 tick 判定）+ 本地通知（Notification API）+ 可选 webhook（serverFn 转发）
- 持久化到 localStorage；UI：AlertManager 面板（列表/启停/删除），图表上价格线标记

### P2-D K 线回放（Replay）
- 模式：选起止时间 → 按播放速度逐 bar 前进（1x/5x/10x/100x），暂停/拖进度条
- 实现：复用 backtest 引擎的数据切片 + chart-engine 的 setFullData/updateLastBar 增量路径（已有 applyTail 正好复用）
- 与回测结合：回放中叠加策略信号/成交点标记

---

## 八、Phase 3 — 交易与生态

### P3-A 交易增强（对齐币安期货）
- 杠杆/保证金模式/持仓模式设置（已有 broker 抽象，UI 层补：杠杆滑块、isolated/cross、one-way/hedge）
- OCO/条件单 UI（serverFn 已支持 order 原语，补 UI + 委托面板分组）
- 滑点估算：depth 加权平均执行价 vs 市价单期望滑点（DepthChart 数据可算）
- 资金费率倒计时 + 标记价/溢价展示（store 已有 mark/funding/nextFunding/setPremium，补 UI 磁贴）

### P3-B 订单流（期货用户高感知）
- 大单热图：累积 delta → 热力色块 canvas 叠加（数据：现有 depth 40 档 + 新增大单统计流）
- OI / 多空比 / 清算地图：serverFn 新接口（Binance futures data 端点）；Header/侧栏展示
- 优先级：P3，若 Phase 2 提前完成可并行

### P3-C 云同步（可选后端）
- workspace/布局/绘图/指标/Alert 序列化为 JSON → 用户空间（服务端新表 or 简单 KV）；多设备合并策略（LWW + 冲突即新副本）
- 无账号方案：导入/导出 JSON 文件（本地备份 + 分享）作为 P3-C 的最小版本（必做）；云同步为扩展

### P3-D 插件生态定型
- 发布插件 API 文档 + 3 个官方示例（指标/绘图/数据源，现有 demo 插件升级）
- `registerIndicator/registerDrawingTool/registerDataSource` 增加类型声明导出 + npm 包（`opencharts-plugin-types`）
- 插件市场页（可选）：展示已注册插件的只读列表

---

## 九、分期验证（每期结尾必须全绿）

```
每期统一验证：npm run typecheck / lint / test（单测 ≥ 160 递增）/ build（bundle ≤ 300kB）
+ 回归：mirror 16 断言、pixel 4 主题、batch1-13 冒烟（每期新增 batch 探针）
+ 新增专项探针：
  P0: 引擎拆分行为等价（全部回归 diff=0）；列式往返 encode/decode 单测
  P1: 无限滚动探针（>3 年无白）、指标属性生效断言、新绘图工具可建/可编辑/可 undo
  P2: Pine strategy 回测与内置策略同报告同结果；Alert 触发探针；replay 逐 bar 前进断言
  P3: OCO 委托链路、热图 canvas 像素断言、云同步 JSON round-trip
```

## 十、风险与取舍

| 风险 | 等级 | 缓解 |
|------|------|------|
| P0 拆分/列式化改动面大，回归风险 | 高 | 拆一步验一步（每模块拆分后立即跑全量回归）；列式保留对象数组兼容层，双路径 A/B 验证 |
| Bundle 超预算（新功能多） | 中 | 每期设 260→300kB 阶梯预算；Pine/回测/Alert 全部懒加载 chunk；check-bundle 硬门禁 |
| Pine 完整化工作量不可控（v5 是大型语言） | 高 | 定义为「v5 常用子集」明确边界（input/strategy/plotshape/alertcondition + 20 函数），完整 v5 永不为目标（对标 TV 也非 100%） |
| 无限历史触发上游限流（Binance 分页拉取压力） | 中 | serverFn 加 TTL 聚合缓存 + 每 symbol/interval 独立游标 + 退避；拉取限速（预填队列） |
| worker 指标计算与主线程同步复杂性 | 中 | P0-D 标记可选；若 P1 性能探针不达标再引入，且用共享内存（SharedArrayBuffer）路径 |
| 云端同步后端成本 | 低 | 最小版本只做 JSON 导入导出；云同步列为 stretch goal |

## 十一、架构打磨 P1.5（Phase 1 后插队，本轮）

> 用户指示先打磨架构层再进 Phase 2。基于实测度量（本轮扫描）制定，每项含**收益量化**。

### 度量基线（实测）
- src 14.1k 行；chart-engine 1006 行（最大单文件）、indicators 751、DrawingOverlay 677、ChartPane 539、history 496、feed 478
- 单测 145（纯业务层全绿）；`as any` 仅 9 处、eslint-disable 4 处（卫生良好）
- bundle 260.7kB gzip（预算 300kB）；serverFn 7 个无统一错误契约；组件高频订阅多裸写 `useTerminal(s=>s.x)`（symbol×8/ticker×6/market×6/invert×6）
- **指标首算基准**：105k bars × 8 常用指标 = **377.6ms 主线程同步阻塞**（macd 169 / supertrend 71 / boll 48 / ema 17 / atr 18 / rsi 24 / kdj 23 / sma 8）。现有 `indicatorJobs()` 同步算完所有指标才逐帧 setData → 加指标/切周期/首次 commit 时 UI 卡 ~0.4s

### 打磨项 + 收益明细（按收益/风险排序）

| # | 项 | 方案 | 收益量化 | 风险 |
|---|----|------|----------|------|
| 1 | **指标分帧计算**（本轮） | compute 移入 restJobs：每帧算 1 个指标 + setData（现在是同步算完 8 个） | 首算阻塞 377ms → 渐进 ~8 帧（每帧 ~40ms 计算 + setData，UI 保持 60fps 响应）；无需 worker 基建；指标逐个出现（TV 同款渐进感） | 低（jobs 队列已存在，仅挪 compute 位置；syncMirror 每 job 后已调用） |
| 2 | **serverFn 统一错误契约**（本轮） | `serverCall` 包装：`{ok, data}\|{ok:false, error:{code,message}}` + 超时/重试约定；7 个 handler 统一；消费端（feed/history）适配 | 错误处理单源（现各 handler 风格不一）；健康面板/未来鉴权限流统一挂点；重试策略集中 | 中（api.ts + 3 处消费端） |
| 3 | **store 纯逻辑单测**（本轮） | zustand 无 DOM 可 node 测：config slice（addIndicator/undo/redo 栈、applyIndicatorPreset）、market slice（updateBar gap/同 bar 原地/append 边界、appendOlderBars 窗口裁剪） | 核心数据流回归锁定（updateBar 的 gap 判定、undo 99 上限、BAR_CAP 窗口是目前零测试的最高风险数据路径） | 低 |
| 4 | **selectors 采用率**（下轮） | 高频裸订阅改用具名（symbol×8/ticker×6/market×6/invert×6/bars×4…） | 订阅意图显式；防未来误改；与 selectors.ts 现有 20+ 导出对齐 | 低（机械替换） |
| 5 | **as any 清理 + eslint-disable 复核**（下轮） | 9 处 as any（lw-charts 类型 edge）改精确类型；4 处 disable 复核 | 类型安全 + 卫生 | 低 |
| 6 | **指标真 worker**（下轮评估） | 分帧后首算不再阻塞（收益从防卡顿降为提速至 <60ms）；列式传参已具备（columns.ts） | 需重新基准；仅当分帧后仍慢再引入 | 中 |
| 7 | **列式驻留**（下轮评估） | BAR_CAP 220k 对象数组 ~10.5MB/序列 + 22 万对象 GC 压力；columns 基础已建 | 待 GC 压力量化后定；优先导出/缓存路径（decode 免重复） | 高（动 store 热路径） |

### 本轮执行
1. ✅ **指标分帧计算**（#1）：compute 移入 restJobs 每指标一帧；**实测**：加 8 指标（MACD/SUPER/BOLL/RSI/ATR/KDJ/DMI/STOCHRSI）不再单次同步阻塞，8 帧渐进渲染；配合链式去分配后帧峰值 40-140ms（原 647ms 单次冻结）
2. ✅ **链式去分配**（#1 衍生，新发现）：macd 的 dea 用 `ema(fake)` 物化 6 万+ Candle 对象（61k bars 实测 289ms）→ 新增 `smaLine/emaLine` 值序列重载，替换 macd/stoch/stochrsi/trix/PPO/trima 全部链式分配点，删除 2 处死代码 toCandles。**实测**：macd 289→140ms（-52%）、kdj 106→40、boll 79→35、supertrend 83→39、stochrsi 51→44；8 指标合计 647→408ms（-37%）；指标单测全绿（行为等价）
3. ✅ **store 纯逻辑单测**（#3）：`store.test.ts` 以 plain reducer 驱动 4 个 slice（无 DOM/persist），10 用例锁定 updateBar gap 判定/同 bar 原地引用稳定/undo 栈上限 100/applyIndicatorPreset/setSymbol 重置等核心数据流
4. ✅ **lib/market 可测性解锁**：61 处相对 import 补 `.ts` 后缀（node 测试链可加载任意模块，vite/tsc 兼容）
5. ⏸️ **serverFn 统一错误契约**（#2）**降级记录**：当前 7 个 serverFn 全是只读行情代理（无业务错误类型），`{ok,data|error}` 重构收益 < 破坏面；已有 8s 超时 + cacheable + 多源 fallback。待 Phase 3 加业务接口（云同步/账号）时随新接口引入
6. ⏸️ **指标真 worker**（#6）**暂缓**：分帧+去分配后首算不再冻结（帧峰值 140ms 可接受），worker 的收益从「防 647ms 冻结」降为「消除 140ms 帧停」，ROI 不足；列式传参基础已备（columns.ts），后续性能门禁（加指标 <100ms/帧）不达标再引入
7. ⏸️ selectors 采用率（#4）/ as any 清理（#5）留下一轮

**本轮验证**：tsc 0、lint 0、单测 196（+10 store）、mirror 16/16、pixel 4 主题、batch5-12 全绿、build 300kB 内

---

## 十二、版本节奏建议

```
v2.0-alpha（P0+P1 完成）→ 内部自测 + 全回归 → v2.0-beta（+P2）→ 公测收集反馈
→ v2.0 GA（+P3 关键项）。每期一个可演示里程碑（alpha 就有「无限滚动 + 指标属性 + 24 绘图」）
```

**本轮可立即启动的 3 件事**（下一个小批次，不依赖决策）：
1. ~~`history.ts` 增加 `endTime` 游标分页 serverFn 参数（无限滚动的数据前提，纯增量）~~ ✅ 已落地：serverFn endTime 游标（既有）+ `extendHistory` 按需向左翻页（complete 后视口越界仍拉）+ `ensureCoverage` 放行；`olderWaveEnds/needsOlderData` 纯函数 6 单测
2. ~~`IndicatorInst` 扩展 color/width/style/scale 字段 + 属性面板 UI（增量，undo 兼容）~~ ✅ 已落地：字段 + 色板/线宽/线型/刻度轴实时生效（computeIndicator opts 透传，3 单测）
3. ~~chart-engine 拆 `export.ts` + `compare.ts` 两个低风险模块（行为等价，先建立拆分模式）~~ ✅ 已落地：CompareManager + 坐标/截图纯函数，全回归无行为 diff（mirror 16/16、pixel 4 主题、batch5/10/12 绿、build 预算内）
