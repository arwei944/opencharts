# 🏗️ OpenCharts 全分层升级方案

> 对项目 7 层逐一研究后的升级规划。目标：**每层给出「现状 → 问题 → 升级方案 → 优先级」**，
> 供按批次执行。基于当前 main + cleanup/slim-down 分支代码（tsc 0 错误，55 测试通过）。

---

## 第 1 层：路由层（src/routes + router）

### 现状
- `routes/`：仅 `__root.tsx`（挂 PreviewHostBridge + AuthProvider + Head meta）+ `index.tsx`（渲染 Terminal）。
- `router.tsx` 6 行：`createRouter({ routeTree, defaultErrorComponent })`，`routeTree.gen.ts` 由插件生成。

### 问题
1. 单页应用只有 1 个业务路由，TanStack Router 的能力（懒加载、错误边界、search params）几乎未用。
2. `__root.tsx` 无应用级错误边界（只挂在 router 层）；SSR hydration 无 loading/fallback 处理。
3. 主题 `data-theme` 硬编码 light，将来若支持多主题需挪到 store 驱动的 head 注入。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| R1 | 引入 TanStack Router **search params**：把 symbol/interval/layout 编入 URL（`/?symbol=BTCUSDT&interval=15m`），支持分享/刷新保持 | 中 |
| R2 | 根路由加 `<ErrorBoundary>` + Suspense fallback（SSR 期间避免白屏） | 低 |
| R3 | `data-theme` 从 store 初始化（`getRouter` 时读 persist 或服务端注入），为多主题铺路 | 低 |

---

## 第 2 层：组件层（components/terminal + components/*）

### 现状
- `Terminal.tsx` 99 行组合 16 个面板组件；`ChartPane.tsx` 367 行（引擎生命周期 + 图例 + DrawShape 内联绘图）；`ChartToolbar.tsx` **346 行**（按钮海）。
- `SettingsModal` 316 行、`CustomIndicatorModal` 302 行、`IndicatorModal` 105 行。
- `preview-host-bridge.tsx`（grok 预览桥）、`index.ts`（库导出，已删旧 ApexChart 导出）仍在。

### 问题
1. **ChartToolbar 严重膨胀**：346 行一个文件，内含 **2 个重复的 CSV 导出按钮**、**2 个重复截图按钮**、大量永不使用的 "external props" 分支（`onSymbolSelect/onIntervalChange/...`，仅 ChartPane 调用且从不传 → 死代码）。
2. **指标按钮是调试残留**：`const kind = kinds[Math.floor(Math.random() * kinds.length)]` —— 点击"指标"随机加一个指标，明显是开发期 hack。
3. `CustomIndicatorModal` 302 行但 `handleAddToChart` 是 TODO（只 log 不入库）→ 整个自定义指标 UI 是空壳。
4. 绘图逻辑内联在 ChartPane 的 `DrawShape`（~70 行），未抽离成独立 overlay 组件。
5. 图例（legend）内联在 ChartPane，无独立组件。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| C1 | **重构 ChartToolbar**：删除重复按钮（CSV/截图各留一个）、删除全部 external props 分支、修复指标按钮（点击应打开 IndicatorModal 而非随机添加） | 高 |
| C2 | 抽离 `Legend.tsx`（图例）、`CsvExport/screenshot` 工具函数到 `lib/export.ts` | 中 |
| C3 | **CustomIndicatorModal 二选一**：完整实现（script-parser → store.addCustomIndicator → chart-engine 渲染 CUSTOM 线）或降级为只读展示；当前空壳最差 | 中 |
| C4 | DrawShape 抽为 `DrawingOverlay.tsx`（SVG 层），ChartPane 瘦身到 ~250 行 | 中 |
| C5 | 组件间通过 store selector 传递，消灭 props-drilling（ChartToolbar 已部分做，继续） | 低 |

---

## 第 3 层：状态层（store.ts）

### 现状
- Zustand 单例 `useTerminal`（438 行），~40 个 action，`persist("apex-desk")`。
- 存：市场状态（symbol/interval/layout/panes）+ 行情数据（bars/paneBars/compareBars/ticker/bids/asks/trades）+ UI 状态（tool/theme/各种 open 开关）+ 引擎状态（invert/mirror/logScale/chartSettings）。

### 问题
1. **单 store 混装三类状态**：数据（bars 10 万根大数组）、UI（开关）、引擎配置 —— 任何 set 都会触发全量订阅组件重渲染（zustand selector 粒度已缓解，但架构上仍是"一切皆全局"）。
2. **`setBars` 每次替换 10 万元素数组**：`bars.slice(-BAR_CAP)` 每次全量拷贝 + `liveOpenTime` 更新 → 高频 WS 更新下 GC 压力大。
3. `paneBars`/`compareBars` 与 `bars` 三份大数组并存，无去重。
4. persist 混存临时数据（watchSymbols、compareSymbols），无效缓存负担。
5. `useChartSettings.ts`（读取 localStorage 的 hooks）**完全无引用**（死代码）。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| S1 | 拆分为 3 个 store：`useMarketStore`（数据）、`useUIStore`（开关/工具）、`useChartConfigStore`（配置，persist 主要在此）——zustand 支持跨 store 引用，改动成本中等 | 中 |
| S2 | **bars 用不可变结构但避免全量拷贝**：只替换增量的 `append/update`（已有 `updateBar` 是 `cur.slice()` 全拷贝，改为 copy-on-write 尾段），或引入 `useSyncExternalStore` + 版本号 | 高（性能） |
| S3 | 删除死代码 `useChartSettings.ts`；persist `partialize` 瘦身（去掉可重算数据） | 低 |
| S4 | 为高频更新（ticker/updateBar）增加 selector 级 `shallow` 比较，避免 ChartPane 因 bars 引用变化全量重渲染（当前 ChartPane 已订阅 bars，WS 每秒触发一次 setFullData 全量 commit） | 高（性能） |

---

## 第 4 层：数据层（feed/history/api/kline-cache）

### 现状
- `feed.ts` 277 行：WS 组合流（kline/depth/trade/ticker），指数退避重连 + 心跳 + visibilitychange（本会话已加固）。
- `history.ts` 345 行：ensureCompleteHistory 回填引擎（IndexedDB 缓存 → 尾部补齐 → 向前预填），10 万根 K 线。
- `api.ts` 148 行：serverFn（fetchKlines/fetchTicker/fetchDepth/fetchWatch/fetchPremium/searchSymbols），多 host 容错 + 超时。
- `kline-cache.ts` 179 行：IndexedDB typed-array 缓存。

### 问题
1. **WS 只订阅主 symbol**：`useMarketFeed` 的 WS 流固定 `btcusdt@kline_15m/...`（依赖 `symbol`/`interval` 变化重建）。**切换 symbol 瞬间连接重建**（已加固但仍有短暂 gap）。
2. `feed.ts` 里 REST 拉取（ticker/depth）与 WS 并存，**初始加载先 REST 后 WS**，首屏数据有 ~1s 延迟。
3. history 预填**每次切 symbol 从 IndexedDB 冷启动**，无内存级缓存（同一 session 内二次打开仍读 IDB）。
4. serverFn 全部走 Binance 直连，**无市场数据 fallback 源**（Binance 宕机即无数据）。
5. `api.ts` 的 `fetchFrom` 每次 new AbortSignal.timeout，无连接池。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| D1 | **symbol 切换走"预连接"**：WS 层维护 2 个 socket（当前 + 目标），切 symbol 时目标先连好再切换，实现无缝 | 高 |
| D2 | 内存缓存层（Map<symbol:interval, Candle[]> + 最近 N 个保留），二次切换秒开 | 高 |
| D3 | 行情源抽象：`DataProvider` 接口（Binance 主 + fallback 备源如 CoinGecko/OKX），serverFn 内 fallback 链 | 中 |
| D4 | 首屏并发：REST + WS 同时发起，先到先渲染（现在串行） | 低 |
| D5 | kline-cache 升级：缓存 `complete` 标记的增量更新（当前全量写回 IDB，105k bars 序列化成本高） | 中 |

---

## 第 5 层：引擎层（chart-engine/indicators/drawing）

### 现状
- `chart-engine.ts` **867 行**：lightweight-charts 5.2 封装（生命周期、setFullData/commit/pending、指标线、成交量、倒垂 mirror、十字线、点击绘制、截图/导出）。
- `indicators.ts` 307 行：纯函数（sma/ema/boll/macd/rsi/kdj/stoch/wr/cci/obv/atr/sar/vwap/supertrend/heikinAshi）。
- `indicator-engine.ts` **576 行**：类封装（注册表 + 实例），但**只被 CustomIndicatorModal 用于展示列表**，计算从未接入渲染 —— 与 chart-engine 的 indicatorJobs 是**两套指标系统**。
- `script-parser.ts` 177 行：Pine 脚本解析器（半成品）。

### 问题
1. **指标双轨**：chart-engine 直接用 `indicators.ts` 纯函数；`indicator-engine.ts` 576 行自成体系却只用于 UI 列表。浪费 + 维护两套。
2. chart-engine 867 行过大：生命周期 / 数据提交 / 指标 / 事件 / 绘制 / 截图 混在一个类。
3. `setFullData(bars, frozen)` 每次 bars 变化全量 `commit`（105k 数组 map 两次），WS 每秒触发 → 性能瓶颈。
4. 自定义指标（script-parser）只解析不渲染（与 C3 呼应）。
5. 无单元测试（indicators.ts 纯函数最适合测试却无测试）。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| E1 | **收敛指标系统**：删 `indicator-engine.ts`（或改造成 chart-engine 的数据源），chart-engine 统一用 `indicators.ts`；CustomIndicatorModal 列表改读 INDICATOR_CATALOG | 高 |
| E2 | chart-engine 拆分为模块：`ChartEngine`（核心）+ `indicator-renderer.ts` + `event-handlers.ts` + `export-utils.ts` | 中 |
| E3 | **增量渲染**：WS 新 bar 到达走 `updateLastBar`（轻量 setData 尾段）而非全量 setFullData（配套 S4） | 高（性能） |
| E4 | CUSTOM 指标闭环：script-parser 解析 → store 存实例 → chart-engine 渲染（配合 C3 一起做） | 中 |
| E5 | indicators.ts 补单元测试（rsi/macd 对已知序列断言） | 低 |

---

## 第 6 层：服务端层（auth/app-data/db/server middleware）

### 现状
- `auth/` 19 文件 **2413 行**（Better Auth + gates + verify + popup + session + isolation + middleware）。
- `app-data/` 13 文件 **1302 行**（connector 工具基建：GoogleCalendar/Drive、登录重定向、readiness）。
- `db.ts` + `migrations/auth/0001_auth.sql`（PGLite/Postgres）。
- `server/middleware/grok-pwa.ts`（PWA/OG 头注入）+ vite.config 插件（auth-popup/pglite-bootstrap/grok-pwa/app-env）。

### 问题
1. **auth/app-data 是平台模板基建，运行时几乎未启用**：
   - `app-data` **零运行时引用**（只有测试引用 + preview-host-bridge 用了 1 个常量 `CONNECTOR_TOKEN_READY_EVENT`）。
   - `auth` 只有 `AuthProvider`（15 行 passthrough）被 `__root` 使用；gates/verify/middleware 无入口。
   - `VITE_AUTH_ENABLED` 默认未关闭（`!== "false"` → 默认 true），但 UI 无登录入口 → **加载了未使用的 3.7k 行 + better-auth/jose/pg/kysely/pglite 依赖**。
2. db.ts 的 PGLite bootstrap 在 dev 启动时运行（vite.config 钩子），但无业务表 → 纯负担。
3. `server/middleware/grok-pwa.ts` + `public/__grok/` 是 grok 平台 PWA 基建（manifest/install 页），对本项目是外部平台耦合。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| A1 | **确认无登录需求后删除 auth/app-data/db/migrations 全套**（~3.7k 行 + 5 个依赖），`__root` 只留 PreviewHostBridge；vite.config 删 auth-popup/pglite-bootstrap 插件 | 高（需用户确认） |
| A2 | 若保留登录：`VITE_AUTH_ENABLED=false` 设为默认（当前默认 true 却无 UI，矛盾），并补登录入口 | 中 |
| A3 | grok-pwa/server middleware 改为可选插件（`PLATFORM=grok` 才启用），脱离 grok 平台可独立部署 | 中 |
| A4 | app-data 若保留则至少让 preview-host-bridge 的引用显式化（当前靠"碰巧同目录"） | 低 |

---

## 第 7 层：构建脚本层（vite.config/scripts/产物）

### 现状
- `vite.config.ts` 150 行：tanstackStart + nitro(vercel) + tailwind + react + 4 个自研插件（pglite-bootstrap/auth-popup/app-env/grok-pwa）。
- `scripts/` 16 个 .mjs（with-app-env/migrate/migration-plan/grok-pwa-plugin/grok-pwa-shared/app-env-plugin/check-auth-invariant/sign-out-plan/install-page + tests + mirror-regression）。
- `package.json`：dev/build/preview/db:migrate/typecheck/test/lint/format/check:auth。

### 问题
1. **dev 脚本在 Windows 无法直接 `npm run dev`**：`with-app-env.mjs` 用 `spawn("vite")` 找不到 `.cmd`（本会话一直绕道直接跑 vite.cmd）—— 环境 wrapper 的跨平台 bug。
2. 无构建产物目录产出验证（.output/dist 不存在，未跑过 `npm run build`）。
3. `check-auth-invariant` 依赖 auth 基建（若 A1 删除则脚本连带删除）。
4. `nitro` preset=vercel 固定；本地无 preview 验证链路（preview.mjs 已删）。
5. 缺少 CI 配置（无 GitHub Actions）、无 lint 门禁在提交前。

### 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| B1 | **修 with-app-env 跨平台**：spawn 时对 Windows 追加 `.cmd` 解析（或改用 `npx vite`），恢复 `npm run dev` 可用 | 高 |
| B2 | 跑通 `npm run build`，确认 Vercel/nitro 产物生成；补 `.output` 冒烟 | 高 |
| B3 | 随 A1 删除 auth 相关脚本（check-auth-invariant/sign-out-plan/migration-plan 依赖 db） | 中 |
| B4 | 补 GitHub Actions：`tsc + lint + test + build` 门禁 | 中 |
| B5 | `npm run dev` 文档化；eslint 已在但无 pre-commit hook（可选 husky） | 低 |

---

## 总体执行路线（建议批次）

```
批次一（零风险清理）     C1 重构 ChartToolbar（删重复/死分支/修指标按钮）
                         S3 删 useChartSettings.ts 死代码
批次二（性能，核心）      S4 + E3 增量渲染（WS 尾段更新替代全量 commit）
                         D1/D2 symbol 无缝切换 + 内存缓存
批次三（架构收敛）       E1 指标双轨收敛（删 indicator-engine）
                         C3 + E4 自定义指标闭环（或降级）
批次四（平台解耦）       A1 删除 auth/app-data（需确认无登录）
                         A3/B1/B2 构建修复 + 可选插件化
批次五（工程化）         B4 CI、E5 指标单测、R1 URL 状态
每批次后：tsc + npm test + dev 冒烟（K线/WS/倒垂回归）
```

**验收标准**：每层升级后 tsc 0 错误、55+ 测试通过、dev 冒烟（K线渲染、WS live、倒垂回归 16 断言）全绿。
