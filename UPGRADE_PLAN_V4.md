# 🧱 OpenCharts 架构层重大升级方案（V4 —— 透明 · 智能 · 自动 · 积木化）

> 在 V3（产品主轴）落地 P0/P1 大部、P1.5 架构打磨（分帧计算/链式去分配/store 测试）之后，
> 用户指示**继续对架构层做重大升级**，四个明确的方向：**透明（可观测）、智能（自适应）、
> 自动（自管理）、积木化（插件化）**。本方案是架构层的专项规划，产品功能延续 V3 的 P2/P3。
>
> 基线：main `8694fd7`（P1.5 收官）。src 17.5k 行、单测 196、bundle 预算 300kB。

---

## 一、北极星与定位

**北极星**：引擎不再是一个"能用的黑盒"，而是一个 **决策可查证、数据有血统、行为会自适应、
能力可插拔** 的积木化平台 —— 任何一次 commit/park/reveal 都能回答"为什么"，
任何一根 K 线都能回答"从哪来"，任何新能力都能通过注册而不是改核心代码加入。

| 支柱 | 一句话定义 | 用户/开发者可感知的价值 |
|------|-----------|----------------------|
| **透明** | 引擎全链路可观测：op-log 审计、帧耗时、数据血统、诊断中心 | 故障 5 分钟内定位到具体管线阶段；性能瓶颈不再靠猜 |
| **智能** | 行为自适应：本地级联、预测预取、自适应调度、主机智能排序 | 缩放/拖拽永远不等数据；多周期上下文瞬时出现；掉线自动换最稳源 |
| **自动** | 生命周期自管理：idle 落盘、隐藏暂停、缺口自愈、策略化窗口 | 零维护：缓存/内存/重连全部自动，健康面板"自愈型" |
| **积木化** | 引擎模块化收官 + 插件注册表从"只写"变"即插即用" + Port/Adapter 契约 | 第三方/新功能不改核心代码即可挂载，回归面从"全量"缩到"插槽" |

---

## 二、现状基线（本轮实测扫描，`8694fd7`）

### 2.1 现有资产（无需重做）

- **引擎已拆 7 模块**：compare/export/viewport/data-pipeline/rest-queue/indicator-render/events（纯函数层全部带单测）
- **store 4-slice**：config(持久化)/market(高频)/ui/trading + selectors 具名热路径订阅
- **列式 I/O 基座**：columns.ts（Int32+Float64 typed-array 契约）+ kline-cache 统一编码
- **数据自愈**：socket 池化/心跳看门狗/指数退避/OKX 双源交叉校验/checkBar 异常过滤/无限滚动 extendHistory
- **调度**：RestQueue 一帧一个 setData、指标分帧计算、in-place 尾段更新、interact 优先窗
- **工程**：196 单测、mirror 16 断言、pixel 4 主题、batch1-12 冒烟、CI、bundle 门禁

### 2.2 本轮扫描到的架构缺口（四维度）

| 文件 | 行数 | 缺口 |
|------|------|------|
| `chart-engine.ts` | **1006** | 组合层仍混 8 职责：指针状态机(~120) / 系列工厂+排版(~180) / 坐标映射 / 倒垂 / 范围管理(~90) 全部内联，模块边界靠注释不靠接口 |
| `plugins/registry.ts` | 77 | **只写注册表**：UI（ChartToolbar/DrawingsPanel/IndicatorModal）全部读硬编码 `TOOLS`/`INDICATOR_CATALOG`，注册了第三方指标/工具 UI 上根本看不到；无生命周期/能力元数据/注册生效机制 |
| `ChartPane.tsx` | 539 | 引擎引导+订阅+绘图桥+minimap+OHLC+文字工具混一文件（本轮只做轻量抽取，重拆留 P3） |
| `feed.ts` / `history.ts` | 478/496 | 直接调用 api.ts 函数，无端口契约；bars 无来源标注（REST/WS/OKX/缓存不可区分）；异常 tick 静默丢弃不隔离不自愈 |
| `HTFBar.tsx` | 161 | 更高周期条**独立重拉**（每 TF 一次 REST），与驻留 bars 重复；无本地级联 |
| `ensureCoverage` | — | 前瞻覆盖固定 `VIEWPORT_LOOKAHEAD_BARS=2000`，不感知拖拽方向/速度（反应式非预测式） |
| `history.ts` snapshot | — | 只在填充 checkpoint 落盘，无 idle 防抖/隐藏页暂停；重连后尾段缺口不自动回填 |
| 遥测 | — | **零**：commit/park/reveal 决策值用完即弃；无帧耗时/队列深度/渲染成本任何指标；`__chartEngines` 是裸实例列表 |

---

## 三、升级方案（按批次）

```
P0  架构地基（本轮实施）—— 引擎重组收官 + 遥测 + 本地级联 + 端口契约   [低风险高杠杆]
P1  透明纵深（本轮实施）—— 数据血统 + 诊断中心 + 预测预取 + 生命周期  [中等风险]
P2  智能自愈 + 插件 v2（下轮）—— 主机智能排序 / 指标智能默认 / 注册表即插即用 / 缺口自愈
P3  积木化 UI + 自测（下轮）—— ChartPane 特征模块化 / DEV 不变式自测 / 回归探针扩展
每期结尾：tsc 0 + lint 0 + 全量回归绿 + 新增单测绿 + bundle 预算内
```

### P0-A1 引擎重组收官（1006 → <400 行薄门面）

把组合层里剩余的内联职责抽成与既有 7 模块同构的三个管理器，全部 DOM 依赖留在引擎外部：

| 新模块 | 职责 | 关键接口（消费方） |
|--------|------|------------------|
| `engine/series.ts` `SeriesManager` | 主/量系列生命周期：rebuildMain / applyBars / applyVol / setType / setInvert / setShowVol / updateSeriesBar / priceFormat / colors / haSource + 坐标映射 | `new SeriesManager(chart, () => state)`；引擎持有 `this.series.*`；HA 缓存内聚（现 haCache/haCacheBars 移入） |
| `engine/pointer.ts` `PointerController` | 指针状态机：pointerdown/move/up/wheel、drag 灵敏度、interact 150ms 优先窗、release 立即放行 | `new PointerController(host, { onDragMove, onInteract, onIdle })`；`bind()/unbind()`；引擎只读 `isDragging/isInteracting`，调 `release()` |
| `engine/range.ts` `RangeController` | 可见范围：setVisibleTimeRange / zoomAt / fit / visibleSpan / suppressRange+rAF 批处理 / minimap 转发 / 拖拽中延迟转发 | `new RangeController(chart, { onRange, onMinimap, isDragging })`；引擎把 `maybeRevealPending` 接进 onRange 回调 |

**引擎保留**：数据提交编排（setFullData/decideCommit 消费/commit/applyTail/pushIndTail）、指标/compare 委托、mirror 倒垂、setTheme/applyTypography、destroy、对外门面。
**收益**：chart-engine 1006→~380 行；每个管理器可独立阅读/替换；与 P0-A 既有 7 模块同构，模式统一。
**风险与验证**：纯行为等价重构 —— 拆一步跑一次 mirror/pixel/batch 回归；无新增行为。

### P0-B1 引擎遥测（透明地基）

| 新模块 | 内容 |
|--------|------|
| `telemetry.ts` | `Telemetry` 类：环形 op-log（容量 500），`log(op, detail?, ms?)` / `snapshot()` / `clear()`；单例 `chartTelemetry`；DEV window 钩子 `__chartTelemetry` |
| `perf-metrics.ts` | `PerfStats`：直方图统计 avg/min/max/**P50/P95**，`record(ms)` / `snapshot()`；供提交耗时/指标帧统计 |
| `telemetry.test.ts` / `perf-metrics.test.ts` | 环形覆盖、P50/P95 计算、清空 |

**接入点（引擎 + 调度）**：`decideCommit` 的 5 种决策（noop/schedule/tail/park/commit）→ `log("commitDecide", {kind, reason})`；commit 实际耗时 → `perf.record`；RestQueue 每个 job 耗时 → `log("job", {key}, ms)`；applyTail → `log("tail", {barTime}, ms)`。
**收益**：黑盒→可查证。健康面板/开发者/未来云端上报统一挂点；"为什么 park 不 commit"从代码推断变成一条记录。
**风险**：低 —— 纯新增，不改行为；开销为每 op 一次对象分配 + 环形覆盖，可忽略。

### P0-C1 多周期自动级联（智能地基）

| 新模块 | 内容 |
|--------|------|
| `aggregate.ts` | `aggregateCandles(bars, stepSec): Candle[]`（open=组首/高=max/低=min/收=组末/量=和，时间=组首对齐）；`aggregateToInterval(bars, fromIv, toIv)`；`lastAggregated(bars, stepSec): Candle\|null`（实时尾值） |
| `aggregate.test.ts` | 已知序列→期望聚合；跨组时间不对齐边界；空/单根；尾值 |

**HTFBar 改造**：删除独立 `fetchKlines`，改为从驻留主图 `useBars()` 用 `aggregateToInterval` 本地派生各更高周期段（不足 60 根显示已有根数，条带随驻留数据自动增长——响应式，零额外请求零延迟）。
**收益**：HTF 上下文条从"每次切换周期 1 次网络往返 + 骨架屏"变为"瞬时渲染"；离线/断网时仍可用；为 P2 的「多周期 pane 自动级联」提供同一派生原语（V3 P1-A 未做的数据级联直接复用）。
**风险**：低 —— 纯函数 + 组件消费方替换；聚合语义与交易所"新周期从整点起"一致（时间对齐由 stepSec 保证）。

### P0-A2 Port/Adapter 契约层（积木化地基）

| 新模块 | 内容 |
|--------|------|
| `ports.ts` | `DataSourcePort`（fetchKlines/fetchTicker/fetchDepth/fetchWatch/fetchPremium/searchSymbols）+ `CachePort`（read/write/prune）+ `defaultPorts`（把 api.ts / kline-cache.ts 适配为端口实现） |
| `ports.test.ts`（轻） | 端口签名完整性 + 默认端口透传冒烟 |

**消费方改造**：`history.ts` / `feed.ts` 从直接 `import { fetchKlines } from "./api.ts"` 改为消费 `dataSourcePort`（机械替换）。serverFn 的 7 个 handler 保持原地（P1.5 已降级记录：只读代理无业务错误类型，待 Phase3 业务接口再统一错误契约）。
**收益**：数据层与引擎之间出现**显式替换点**——未来接自建后端/多所聚合/模拟数据源，只实现一次 `DataSourcePort`，不碰 history/feed/engine；与 plugins 注册表（P2 的 registerDataSource）形成闭环。
**风险**：低 —— 类型层改动，行为零变化。

### P1-B2 数据血统（透明）

| 改动 | 内容 |
|------|------|
| `lineage.ts` | `DataSource = "rest"\|"ws"\|"okx"\|"cache"`；`bumpLineage(cur, key, source, n?)` → 各来源计数 + 最近时间 |
| `market-slice` | `updateBar(bar, source?)` 增加可选来源参数（默认 undefined 向后兼容）；store 增非持久化 `dataLineage: Record<string, LineageInfo>` + `recordSource(key, source, n?)` |
| 接入点 | feed WS kline → `recordSource(key,"ws")`；history setAll/appendOlder/appendNewer → `"rest"`；hydrateFromCache → `"cache"`；OKX 副流 → `"okx"` |
| 健康面板 | 主图系列来源构成（WS × / REST × / 缓存 × / OKX ×） |
| `lineage.test.ts` | 计数合并/缺省/首见 |

**收益**："这根 K 线从哪来"可回答；数据质量争议（如 OKX 降级期）可从面板直接看到来源占比；为 P2 缺口自愈提供"哪些缺口是 WS 漏的"判定基础。

### P1-B3 诊断中心（透明）

- `HealthPanel` 新增「引擎性能」段：提交耗时（avg/P95）、指标帧（avg/P95）、最近 op-log（折叠查看最近 20 条）。
- 遥测窗口钩子 `__chartTelemetry`（DEV）文档化到 README。
- **收益**：健康面板从"行情健康"升级为"引擎健康"；性能回归不用再跑一次手动探针，打开面板即见。

### P1-C2 预测性预取（智能）

| 新模块 | 内容 |
|--------|------|
| `predictor.ts` | `PanSample{t,from,to}`；`pushSample(samples, s, cap)`；`predictVelocity(samples): bars/s`（负=向左）；`adaptiveLookahead(base, velocity, min, max)` |
| `predictor.test.ts` | 匀速/加速/反向/静置 → 期望前瞻倍数 |

**接入**：`ensureCoverage` 的 `VIEWPORT_LOOKAHEAD_BARS` 固定值改为 `adaptiveLookahead`（基础 2000，向左快速拖拽时最高 4×）；采样来自引擎 onViewport（已有回调，只需记录带时间戳的 from/to）。
**收益**：向左快速拖拽不再撞"加载中"（现在的反应式触发要等视口贴边才补）；滚动大历史平滑度对齐 TV。

### P1-D1 生命周期管理器（自动）

| 新模块 | 内容 |
|--------|------|
| `lifecycle.ts` | `isIdle(state)`；`debounceDecide(now, lastFire, delayMs)` → fire/hold；`LifecyclePolicies{idleSnapshotDelayMs=3000, hiddenPause=true}`（纯决策，可测） |
| `useLifecycle()` hook | 监听 store：idle 3s 且存在 dirty 系列 → 导出 `flushSnapshot(ref)` 触发 IDB 落盘（history.ts 暴露 flush 入口）；`visibilitychange` hidden → `cancelHistory` 全部 job；visible → 重建 refs 重跑 `ensureCompleteHistory` |
| `lifecycle.test.ts` | idle 判定/防抖时序/暂停策略 |

**收益**：快照从"填充 checkpoint 才写"变为"闲了自动写"，退出即最新；隐藏页不再空转拉取（省流量/限流配额）；重连/回前台自动恢复填充——零维护。

### P2 概要（下轮，智能自愈 + 插件 v2）

- **C4 主机智能排序**：WS 四 host 按重连失败率排序，`hostIndex` 轮换变成功率加权；异常 tick 隔离（记录入血统而非静默丢弃）→ 定时缺口自愈扫描（复用 history page()）。
- **C5 指标智能默认**：`INDICATOR_CATALOG` 增加每周期参数覆盖 + 主/副图自动建议；纯函数 + 单测。
- **A3 插件注册表 v2**：生命周期（register→activate/deactivate）、能力元数据（scope: indicator|drawing|datasource|theme|settingsSection|panel|toolBehavior）、**注册即生效**——ChartToolbar/DrawingsPanel/IndicatorModal/SettingsSections 全部改为消费注册表（先读内置注册、再叠加外部），把"只写注册表"变"即插即用"。

### P3 概要（下轮，积木化 UI + 自测）

- **A4**：ChartPane 539 行特征模块化（engine-boot hook / minimap 模块 / OHLC 读数 / 绘图桥），组件变组合。
- **D4**：DEV 运行时不变式自测（提交后 bars 单调、尾段引用稳定、缓存 round-trip），结果汇入遥测。
- **D5**：回归探针扩展（aggregate/predictor/lifecycle 专项探针）。

---

## 四、对比现有架构的收益总表

| # | 升级项 | 现有架构（V3 收官态） | 升级后（本方案落地） | 收益（量化/可感知） |
|---|--------|---------------------|---------------------|-------------------|
| 1 | **引擎重组收官** (P0-A1) | chart-engine 1006 行混 8 职责；改指针/系列/范围任一逻辑都要通读整类 | 薄门面 ~380 行 + Series/Pointer/Range 三管理器（与既有 7 模块同构） | 单文件定位时间从"全文搜索"降到"按模块名直达"；新逻辑只碰一个管理器，回归面缩小到该模块 |
| 2 | **引擎遥测** (P0-B1) | 决策值用完即弃；"为什么 park"只能读代码推断；无任何性能指标 | 全决策点 op-log + 提交/指标帧 P50/P95 直方图 + `__chartTelemetry` | 故障定位从小时级降到分钟级；性能回归可被 CI 探针断言（P1-B3 接入面板） |
| 3 | **多周期本地级联** (P0-C1) | HTF 上下文条每 TF 一次 REST 往返 + 骨架屏；断网即不可用 | 驻留 bars 本地派生，瞬时渲染、零请求、离线可用 | 每次切换周期省 ~3 次网络往返（首屏类感知：~0 延迟 vs ~300ms）；为数据级联提供原语 |
| 4 | **端口契约** (P0-A2) | history/feed 直连 api.ts；换数据源要改 3 个文件 | 显式 DataSourcePort/CachePort 替换点 | 接自建后端/模拟数据 = 实现 1 个接口；与插件注册表闭环 |
| 5 | **数据血统** (P1-B2) | bars 无来源信息；"这波数据是不是 OKX 降级的"靠猜 | 每来源计数 + 面板来源构成 | 数据质量争议 10 秒内查证；为缺口自愈提供判定基础 |
| 6 | **诊断中心** (P1-B3) | 健康面板只有行情维度；性能靠临时脚本探针 | 引擎性能段（提交/指标帧 P50/P95）+ op-log 查看 | 打开面板即见引擎健康，无需跑探针 |
| 7 | **预测预取** (P1-C2) | 前瞻固定 2000 根，拖拽快会撞"加载中" | 方向/速度感知前瞻（最高 4×） | 快速向左拖拽大历史平滑，TV 级观感 |
| 8 | **生命周期** (P1-D1) | 快照只在填充 checkpoint 写；隐藏页继续拉取 | idle 防抖落盘 + 隐藏暂停/前台恢复 | 退出即最新、省流量/限流配额、零维护 |
| 9 | **插件即插即用** (P2-A3) | 注册表"只写"：注册了 UI 看不到；核心文件硬编码 TOOLS/CATALOG | 注册即生效，UI 全部消费注册表 | 新指标/工具=注册 1 次，零核心改动；回归面从全量缩到插槽 |
| 10 | **智能自愈** (P2-C4/D2) | 异常 tick 静默丢弃；host 轮询不按成功率 | 隔离+血统记录+定时补缺口；host 成功率加权 | 数据完整性可自愈，多源切换选最稳源 |

---

## 五、分期验证（每期硬门槛）

```
统一验证：npm run typecheck / lint / test（单测 ≥ 196 递增）/ build（bundle ≤ 300kB）
+ 回归：mirror 16 断言、pixel 4 主题、batch5-12 冒烟
+ 新增探针：
  P0: 引擎拆分行为等价（全量回归 diff=0）；telemetry 环形/直方图单测；aggregate 已知序列断言；
      HTFBar 零请求探针（devtools network 计数）
  P1: lineage 来源计数断言；HealthPanel 性能段渲染断言；predictor 方向/速度 → 前瞻倍数断言；
      lifecycle idle/防抖/暂停时序断言
```

## 六、风险与取舍

| 风险 | 等级 | 缓解 |
|------|------|------|
| 引擎重组（A1）回归风险 | 中 | 纯行为等价；拆一个模块跑一次 mirror/pixel/batch；管理器接口先定后拆 |
| HTF 本地派生覆盖不足（新开页面 1s/1m 周期驻留少） | 低 | 派生条带随驻留数据响应式增长；不足 60 根显示已有根数（TV 同款"有多少显示多少"）；不做 fetch 兜底以保持零请求纯度 |
| updateBar 增加 source 参数的面 | 低 | 默认参数向后兼容；store.test 补用例锁定 |
| 生命周期 hook 与现有 feed 效应竞态 | 中 | 复用既有 jobs Map 的 gen 取消机制；visibility 暂停只动 history job，不动 WS |
| bundle 预算（遥测+聚合+预测+生命周期≈3-5kB） | 低 | 全部树摇友好纯模块；监控面板保持懒加载 |

---

## 七、本轮执行计划（P0 + P1）

### P0 批次（✅ 已全部落地，`e245bc7`→`2c52b92` 4 commits）
1. ✅ **A1**：`engine/series.ts` → `engine/pointer.ts` → `engine/range.ts` + `engine/options.ts` + `engine/theme.ts`；chart-engine 1006→501 行；全量回归绿
2. ✅ **B1**：`telemetry.ts` + `perf-metrics.ts` + 6 单测；引擎/队列接入 op-log 与帧耗时；`__chartTelemetry`/`__chartPerf` 钩子（浏览器实测见 park/commit 决策轨迹）
3. ✅ **C1**：`aggregate.ts` + 5 单测；HTFBar 本地派生（浏览器实测 3×60 蜡烛、**零网络请求**、点击切周期正常）
4. ✅ **A2**：`ports.ts`（DataSourcePort 6 操作 + CachePort 3 操作）；history/feed 消费端口；3 契约测试；新 symbol 取数链路实测正常
5. ✅ **P0 验证**：mirror 16/16、pixel 4 主题、batch10-12、lib 161、build 262.8kB

### P1 批次（✅ 已全部落地，`5cd3d7a`→`a1db0a2` 4 commits）
6. ✅ **B2 lineage**：`lineage.ts` + 5 单测 + 3 store 测试；updateBar(bar,source?)/recordSource；feed WS/OKX + history REST/缓存全部打点；健康面板来源构成行（实测 rest/ws/okx lastSeen 实时）
7. ✅ **B3 诊断中心**：健康面板「引擎性能 avg/P95」段 + op-log 折叠查看（实测 commitP95 28.7ms、15 ops）；README 文档化 DEV 钩子
8. ✅ **C2 predictor**：`predictor.ts` + 8 单测；ensureCoverage 自适应前瞻；ChartPane 喂采样 + panPredict 遥测（实测拖拽产生放大前瞻）
9. ✅ **D1 lifecycle**：`lifecycle.ts` + 4 单测 + `useLifecycle` hook（Terminal 挂载）；idle 防抖落盘 + dirty 签名门控（实测 fetchedAt 稳定不重复写）+ 隐藏页暂停/恢复；**顺手修复 runFill 收尾 snapshot 未查 alive() 的缓存污染竞态**
10. ✅ **P1 验证**：mirror 16/16、pixel 4 主题、batch10-12、lib 181、build 264.4kB

### 下轮（P2/P3）待办
- **P2**：A3 插件注册表 v2（注册即生效）/ C4 主机智能排序+缺口自愈 / C5 指标周期感知默认
- **P3**：A4 ChartPane 特征模块化 / D4 DEV 不变式自测 / D5 回归探针扩展

### P2 批次（✅ 已全部落地，`d5ff56c`→`22437b8`+`e46cd89`，第 2 轮）
1. ✅ **A3 插件注册表 v2**：PluginScope 元数据 + activate/deactivate/unregister 生命周期 + `indicatorCatalog()`/`drawingTools()` 合并目录（UI 全部改消费注册表）；`computeIndicator` 插件 kind 分发（带 CUSTOM 同款渲染护栏）；ChartPane 插件工具点数 + DrawingOverlay 插件渲染 shell；**修复根因：demo 插件注册入口从未被导入**（Terminal 挂载）；浏览器验证 DSMA 弹窗可加 + xmark 2 点绘制
2. ✅ **C4a 主机智能排序**：`host-picker.ts` 失败率加权选下一主机（平局轮询、不立即重试死主机）+ 跨会话失败分；重连遥测带 host+score
3. ✅ **C4b 异常隔离打点**：丢弃 tick 发 `feedDrop` 遥测（reason/gaps/time），健康面板 op-log 可见
4. ✅ **C4c 缺口自愈**：`healer.ts` findGaps/mergeGapPage 纯函数 + healGap 单页取数（修正 endTime 分页方向）+ healMasterGaps；lifecycle 60s 可见+idle 时扫描；**端到端实测**：注入缺口 gapsBefore 1 → gapsAfter 0，healGap 打点、零 pageerror
5. ✅ **C5 指标智能默认**：`indicator-defaults.ts` 1s/1m 短周期默认参数（MA/EMA/RSI/BOLL/MACD），addIndicator 按周期选择；浏览器实测 1s MA→[3,10,25]、15m→[7,25,99]
6. ✅ **探针加固**：mirror-regression 的 MACD pane 等待改轮询（fill commit 会挤掉指标渲染 job，固定 2500ms 脆弱）；连跑 5/5 零失败

**P2 验证**：lib 188+、mirror 5×16/16、pixel 2 主题、batch10-12、build 265.1kB

### P3（下轮）待办
- A4 ChartPane 特征模块化 / D4 DEV 不变式自测 / D5 回归探针扩展 / SettingsSections 插件化

### P3 批次（✅ 已全部落地，`4b90d13`→`8225b10` 4 commits，第 3 轮）
1. ✅ **A4 ChartPane 特征模块化**：539→207 行——`panes/use-chart-engine`（懒启动+ResizeObserver+ready 信号）、`use-viewport-coverage`（predictor 覆盖/minimap/联动发布·订阅）、`use-ohlc-readout`（十字光标读数，canvas 侧）、`use-draw-click`（点击绘制+文本编辑状态）、`use-sync-effects`（全单向同步+compare，keyed on ready 让懒建引擎重放初始状态）、`use-history-fill`+`series-ref`；组件变组合；mirror 3×16/16、batch10-12 回归
2. ✅ **D4 DEV 不变式自测**：`invariants.ts` 纯检查（bars 单调/列式 round-trip/indTail·驻留尾同步）+ 引擎 commit 后 DEV 自测，违规入遥测 lifecycle 记录（生产零开销）；4 单测
3. ✅ **D5 回归探针**：`batch13-smoke.mjs` 12 项专项（aggregate 对齐+实时尾/predictor 放大/lineage 血统/telemetry op-log+perf/healer no-op/插件 UI 证据/invariants 干净）——**踩坑**：vite dev 绝对 URL 动态 import 会 fork 模块图，插件探针改 UI 证据断言后 12/12
4. ✅ **SettingsSections 插件化**：registry `registerSettingsSection(id,title,render)` + SettingsModal 尾部渲染插件分区（demo “关于插件系统”浏览器验证）

**P3 验证**：lib 209、mirror 16/16、pixel 4 主题、batch12/13 全绿、build 预算内

### P4 批次（架构延续，`5ca96e8`→`0b61a9a`，第 4 轮）
1. ✅ **数据级联 pane 化**：`aggregate.isDerivable`（更粗且整除才派生）——副图周期高于主图时 `use-pane-bars` 从主图驻留 bars 本地聚合（memo 于主图引用，WS in-place tick 不重建）；`use-history-fill` 跳过可派生 pane（零 REST/零状态任务）。**实测**：1x2（15m+1h）historyStatus 仅 15m、派生尾 bar == 主图尾 bar
2. ✅ **主题/面板插件消费**：`registerTheme`/`registerPanel` + `resolveThemePalette`（内置→插件→dark 兜底）；engine options/theme 走 registry → 插件主题作用于 canvas；SettingsModal 合并主题列表；Terminal 右栏按插件数动态行；**顺手修复 setThemePref 只存 pref 不应用主题的潜伏 bug**。**实测**：选“午夜”→ engineBg #0a0d14
3. 🔬 **指标 worker 评估（决策：缓）**：实测 8 指标 × 40k bars——job（compute+setData）P95 **340ms**、commit（纯 candles setData）P95 **208ms** → 卡顿主因是 lw-charts 全量 setData 本身，worker 化 compute 仅消除 ~130ms，剩 208ms setData 仍超 16.7ms 帧预算；SharedArrayBuffer/竞态/双路径成本 > 收益。**保留门禁**：若后续出现“批量加指标 <100ms/帧”硬要求再引入（columns 传参基础已备）
