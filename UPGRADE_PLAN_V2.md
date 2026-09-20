# 🏗️ OpenCharts 全面升级方案 V2（下一轮）

> 基于 V1（UPGRADE_PLAN.md）全部执行后的当前代码重新调研。
> 现状基线：src 6.6k 行、14+18 依赖、223M node_modules、tsc 0 错误、59+6 测试、CI 已配。
> 目标：**每层给出「升级后现状 → 新问题 → V2 升级方案 → 优先级」**。

---

## 第 1 层：路由层

### V1 后现状
- `index.tsx`：`validateSearch`（symbol/interval/layout）+ URL↔store 双向同步（已完成 R1）
- `__root.tsx` 41 行（PreviewHostBridge + Outlet）；router 6 行用了 `AppErrorComponent`
- 仍有旧 `lib/error-boundary.tsx`（DataErrorBoundary/withErrorBoundary）**零引用**

### 新问题
1. **懒加载/代码分割为零**：整个 Terminal（含 lightweight-charts 219KB gzip 后仍占大头）打进首屏 bundle，无 `pendingComponent`/`Suspense`。
2. `DataErrorBoundary`/`withErrorBoundary`（111 行）死代码 —— 组件级错误边界未接入。
3. URL 同步只覆盖 3 个字段；chartType/theme/tool 等 UI 态、多 pane interval 未编入。
4. SSR hydration 无 loading 态，慢网首帧白屏风险。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| R2-1 | 路由级 `pendingComponent` + Suspense 骨架屏；chart-engine 走 `import()` 懒加载（首屏只拉 App 壳，图表引擎按需） | 高 |
| R2-2 | 删除死代码 `lib/error-boundary.tsx` 或将 `DataErrorBoundary` 接入 ChartPane/Terminal 组件树 | 低 |
| R2-3 | URL 扩展：`chartType`/`theme`（或 `?view=` 复合参数），为深链接铺路 | 中 |
| R2-4 | 路由守卫：非法 symbol（不存在于搜索列表）跳回默认 + toast | 低 |

---

## 第 2 层：组件层

### V1 后现状
- `ChartToolbar` 已瘦身 346→233 行；`ChartPane` 371 行仍含图例+DrawShape 内联绘图
- 16 个组件共 2.2k 行；`Terminal` 99 行
- `SettingsModal` 316 / `CustomIndicatorModal` 303 / `BottomPanel` 168 / `OrderTicket` 163

### 新问题（本轮实测）
1. **可访问性几乎空白**：13/16 组件 **0 个 aria 属性**（唯一用的是 InvertedViewToggle 的 aria-pressed 等 3 处）。键盘导航、读屏、焦点管理基本缺失。
2. **ChartPane 370 行职责过载**：图例（Legend）、内联 DrawShape、HistoryBadge、引擎生命周期全在一个文件。
3. `CustomIndicatorModal` 303 行仍偏大（脚本编辑器/测试结果 UI）；`SettingsModal` 316 行单文件（多个 section 无子组件）。
4. **eslint 22 个问题**（5 error / 17 warning）：未使用 import（`@ts-ignore`、`settings` 未用变量、`Download/Copy/Trash2/Settings` 死 import）——`npm run lint` 不干净，CI lint 步骤会红。
5. 移动端布局：`Terminal` 双 ChartBoard（lg 断点两份）——功能正常但代码有重复渲染路径。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| C2-1 | **全组件 a11y 补丁**：aria-label 补全（工具按钮/弹窗/开关 tab）、`role="dialog"`+焦点陷阱（现有 Modal 无 focus trap）、键盘可达（Esc 关闭弹窗） | 高 |
| C2-2 | ChartPane 拆分立件：`Legend.tsx` / `DrawingOverlay.tsx`（SVG 绘图层）/ `HistoryBadge.tsx`；ChartPane 收敛引擎生命周期 | 中 |
| C2-3 | **eslint 清零**：删未使用 import/变量，`@ts-expect-error` 替换 `@ts-ignore`，修 no-empty/no-useless-escape；让 `lint` 绿（CI 硬门禁） | 高 |
| C2-4 | SettingsModal 拆 section 子组件（Crosshair/TimeScale/PriceScale/Volume/Compare）| 低 |
| C2-5 | Terminal 双 ChartBoard 收敛为响应式单实例（监测断点切换 tab 而非同时挂两份） | 中 |

---

## 第 3 层：状态层

### V1 后现状
- `store.ts` 465 行单 store（Zustand + persist `apex-desk`）；`customFns` 会话级已分离
- 大数组：bars/paneBars/compareBars/historyStatus 全部驻留 store
- persist 持久化 symbol/interval/layout/chartType/若干 UI 态

### 新问题
1. **单 store 仍混合三类状态**（V1 已识别但未拆）：行情数据、UI 开关、引擎配置 —— 任一 set 全量通知订阅者。
2. `updateBar` 每次 `cur.slice()` 全量拷贝 105k 数组（RB 级 GC 压力，V1 E3 只在引擎层解决了 commit，store 层拷贝仍在）。
3. persist 无版本号/migration 策略：未来 store schema 变更会静默污染旧 localStorage。
4. `paneBars`/`compareBars` 与 `bars` 无容量联动（BAR_CAP 各自 slice，未共享预算）。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| S2-1 | store 拆分仍推荐，但**先做低成本收益**：高频字段（ticker/updateBar）走 `useSyncExternalStore` 或 selector `shallow`；`updateBar` 用 copy-on-write 尾段结构（结构共享）而非全量 slice | 高 |
| S2-2 | persist 加 `version: 2` + `migrate` 函数（旧数据兼容迁移） | 中 |
| S2-3 | 引入 selectors 层（`market/history/compare` 分离订阅）降低 ChartPane 重渲染 | 中 |
| S2-4 | bars 存储改 typed-array 列式（对齐 kline-cache 的 encodeBars）——App 内换算直接消费列，省中间 Candle[] | 低（大改） |

---

## 第 4 层：数据层

### V1 后现状
- `feed.ts` 330 行：双 socket 池（park/take）+ 指数退避 + 心跳 + visibilitychange
- `history.ts` 345 行：IDB + 内存缓存回填；`kline-cache.ts` 内存镜像（容量 8）
- `api.ts` 7 个 serverFn，8s 超时 + 多 host 粘性

### 新问题
1. **无行情源降级/多源**：Binance 全挂了 = 无数据（serverFn 直连 Binance 无备源）。
2. ws 连接状态无用户可见聚合（Header 只有「实时/连接中」布尔；断线重试过程无提示）。
3. `feed` 的 REST 初拉（ticker/depth）与 WS 串行：首屏 ~1s 延迟（V1 D4 未做）。
4. history 预填量大：15m 全量 105k 根 / ~5MB IDB 写入；`snapshot` 每完成一次全量写回。
5. serverFn 无缓存层/无请求合并：同 symbol 多 pane 会重复请求。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| D2-1 | **多源抽象 `DataProvider`**：Binance 主 + 备源（OKX/Coinbase/自配），serverFn 内按 host 健康度 fallback；REST 初拉与 WS 并发（先到先渲染） | 高 |
| D2-2 | 服务器端 serverFn 加 **内存 5s TTL 聚合缓存**（同 key 并发去重、窗口合并） | 高 |
| D2-3 | 连接状态升级：`connection: 'connecting'|'live'|'degraded'|'offline'` 入 store，Header 微章展示 + 重试计数 | 中 |
| D2-4 | history 增量快照：IDB 只写增量（append tail）代替全量 encodeBars | 中 |
| D2-5 | 补 data 层单测：feed parseKline、history horizonOf、kline-cache encode/decode 往返 | 中 |

---

## 第 5 层：引擎层

### V1 后现状
- `chart-engine.ts` **903 行**（最大文件）；已有：applyTail 增量、syncMirror 全标尺、自定义指标线、URL 无关
- `indicators.ts` 307 行 + 6 单测；`script-parser.ts` 177 行
- 截图/CSV 导出、十字线、点击画线、对比线全在此文件

### 新问题
1. **903 行单类职责爆炸**：渲染（setFullData/commit/pending）、事件（pointer/wheel/crosshair/click）、指标管线（indicatorJobs）、绘图接口（priceToY/timeToX）、导出（screenshot）、compare 生命周期 —— 十种职责一文件，测试与维护都难。
2. 无引擎层单元测试（依赖 DOM，但核心算法如 commit/applyTail/坐标换算可抽纯函数）。
3. 绘制工具仅两三点（hline/vline/trend/rect/fib/parallel 内联在 ChartPane DrawShape ~70 行），无选中/拖拽/删除交互。
4. `setFullData` 的 frozen/pending 逻辑 + `applyTail` 分支无测试覆盖，改动风险高。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| E2-1 | **chart-engine 模块化拆分**：`core.ts`（生命周期/数据提交）+ `indicators.ts`（渲染管线已独立）+ `drawing.ts`（绘图坐标/序列化）+ `export.ts`（screenshot/csv）；保持 public API 稳定 | 高 |
| E2-2 | 抽**纯函数层**（`bars.ts`：commit 决策/applyTail 判定/坐标 round-trip）并补单测 —— DOM 无关，测试成本低 | 高 |
| E2-3 | 绘图工具升级：drawing 状态入 store（V1 已有 drawings），加选中/拖拽/删除/属性编辑 UI | 中 |
| E2-4 | 渲染性能：`setData`→`update` 微调经 applyTail 已 OK；进一步做 barSpacing 自适应（缩小时降采样渲染） | 低 |

---

## 第 6 层：服务端层

### V1 后现状
- auth/app-data/db/migrations 已全部删除 → 纯 serverFn 轻服务
- `api.ts` 7 个 createServerFn；`server/middleware/grok-pwa.ts` PWA 头注入
- vite.config：nitro(vercel) + tanstackStart + tailwind + react + grok-pwa

### 新问题
1. **serverFn 无统一错误处理/超时约定**：各 handler try/catch 风格不一，无结构化错误体（业务错误 vs 网络错误）。
2. `grok-pwa` 平台耦合仍在（manifest/OG 注入对 grok 专用）；非 grok 部署无 PWA。
3. Nitro preset 固定 vercel，无本地 preview 验证（preview.mjs 已删）。
4. **数据层是唯一 serverFn 用途**：无鉴权/限流（对公网 Binance 查询无影响，但未来加业务接口需要）。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| A2-1 | serverFn 统一响应契约：`{ ok, data|error }` + `createServerFn` 包装器（超时/重试/标准化错误） | 高 |
| A2-2 | grok-pwa 插件化：`GROK_PLATFORM` env 开关，默认不启用（非 grok 部署轻盈） | 中 |
| A2-3 | 补 `npm run preview` 本地验证链路（nitro start 冒烟脚本） | 中 |
| A2-4 | 若将来加用户数据：再评估更轻的 auth（单服务商 OAuth）而非 reintro Better Auth 全家桶 | 低 |

---

## 第 7 层：构建脚本层

### V1 后现状
- CI 已配（tsc+lint+test+build Actions）、lockfile 已提交、`npm run dev` Windows 可用、build 跑通（.vercel 2.8M）
- 构建产物：SSR runtime + routes chunk；lightweight-charts 219KB gzip 60KB 为最大 chunk
- lint 有 **22 个问题**（CI 会失败）；测试 59 script + 6 indicator

### 新问题
1. **CI lint 门槛当前必红**（22 个 eslint 问题未清）——V1 说"lint 已在但无门禁"，现在有了门禁但不过。
2. 无产物巡检：`.vercel` 构建后无人跑 preview 冒烟（V2 应与 A2-3 合并）。
3. 无依赖审计自动化（npm audit 未入 CI）；无 bundle 体积预算/警告。
4. 无本地 git hook（husky）强制 pre-commit 通过 lint+typecheck。

### V2 升级方案
| 项 | 方案 | 优先级 |
|----|------|--------|
| B2-1 | **eslint 清零 + CI 绿**（配合 C2-3）：删死 import、修 no-empty/escape、`@ts-ignore`→`@ts-expect-error` | 高（先做） |
| B2-2 | CI 增 `npm audit --audit-level=high` + bundle-size 预算脚本 | 中 |
| B2-3 | preview 冒烟：build 后启动 nitro preview + Playwright 断言（复用 mirror-regression 模式） | 中 |
| B2-4 | husky + lint-staged（pre-commit: lint+tsc） | 低 |

---

## 总体执行路线（V2 批次）

```
批次 A（工程质量，先做）  C2-3 + B2-1  eslint 清零；S2-1 updateBar copy-on-write
                         D2-5 数据层单测；E2-2 引擎纯函数层 + 单测
批次 B（可用性）          C2-1 全组件 a11y；R2-1 懒加载 + Suspense；D2-3 连接状态
批次 C（可靠性/规模）      D2-1 多源 fallback；D2-2 serverFn 缓存；A2-1 错误契约
                         E2-1 chart-engine 模块拆分
批次 D（打磨）            R2-3 URL 扩展；C2-2 组件拆分；E2-3 绘图交互；B2-2 audit/预算
每批次后：tsc 0 + npm test 全绿 + lint 0 + dev/build 冒烟 + 倒垂回归 16 断言
```

**验收标准**：`npm run lint` 0 问题、tsc 0 错误、测试 ≥65 全绿、a11y audit 通过（无 aria 组件清零）、CI 全绿。