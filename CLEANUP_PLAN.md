# 🧹 OpenCharts 项目清理与瘦身方案

> 基于对仓库的完整扫描（依赖使用、引用图、体积、git 状态）制定。
> 目标：**删除 60% 冗余代码量、缩减 ~40% 依赖项、收敛双轨实现、清理全部调试残留**，
> 且不破坏现有 K 线渲染与交易面板功能。

---

## 一、现状体检结果（调查数据）

### 1.1 体积分布

| 项目 | 大小 | 说明 |
|------|------|------|
| `node_modules/` | **359 MB** | 最大头，依赖严重冗余 |
| `.trash/` | **4.5 MB / 49 文件** | 全部是调试探针、截图、临时脚本 |
| `src/` | 714 KB / ~16k 行 | 其中约 **40% 是死代码**（见下） |
| 仓库根目录 MD 文档 | 17 个文件 / ~7.5k 行 | 开发过程记录，非交付物 |

### 1.2 死代码（无任何引用）

| 路径 | 规模 | 证据 |
|------|------|------|
| `src/components/ApexChart.tsx` | 583 行 | 仅被 `components/index.ts` 与 storybook 引用，`components/index.ts` 本身无任何入口引用（路由只用 `Terminal`） |
| `src/components/examples/*` (3 文件) | ~350 行 | 只 import ApexChart 旧库 |
| `src/components/index.ts` | 小 | 旧库出口，无人用 |
| `src/data/*`（7 文件，cache-manager/rest-api/websocket-manager/data-aggregator/kline-cache/types/index） | ~2,000 行 | **旧版数据层**，仅被 `ApexChart.tsx` 引用；新版数据链路在 `src/lib/market/` |
| `src/lib/multiplayer/*`（p2p.ts, index.ts） | ~570 行 | 全仓库无引用 |
| `src/components/terminal/TouchGestureIntegration.tsx` | 未跟踪新文件 | 无引用（`touch-gesture.ts` 也是孤儿） |
| `src/components/terminal/DrawingOverlay.tsx` | 旧版 | 无引用（V2 已取代，见 `DrawingOverlayV2.tsx`） |
| `src/lib/market/drawing-engine.ts` | 旧版 | 无引用（V2 已取代） |
| `.storybook/` | 配置 | 引用旧 ApexChart；package.json **没有** storybook 依赖，属于半成品残留 |
| `e2e/chart.spec.ts` | 测试 | 针对旧 `#apex-chart-*` DOM 结构，与新版 `Terminal` 不匹配，且 baseURL 是 localhost:3000（实际 8080），**永远跑不过** |

### 1.3 调试残留（生产代码内的垃圾）

- `feed.ts` / `history.ts` / `store.ts` 中的调试日志（上一轮修复后大部分已清理，需复查）
- `.trash/` 49 个文件（4.5 MB）：probe*.json、diag*.json、zz-*.mjs、mirror-probe-artifacts 等
- 仓库根目录 17 个 MD：`KLINE_DEBUG_DIAGNOSTICS.md`（问题已修复）、`FINAL_SUMMARY.md`、`PHASE_COMPLETE.md` 等开发过程记录
- `startup.sh`、`USAGE.md`、`TASK-GUIDE.md`（生成器模板残留）

### 1.4 未使用的 npm 依赖（0 次 import）

**dependencies（直接删）：**
```
date-fns-jalali  recharts  date-fns  vaul  cmdk
react-resizable-panels  react-day-picker  react-hook-form  @hookform/resolvers
@radix-ui/react-* （16 个包全部 0 引用）  @tanstack/react-query  @tanstack/react-table
@tanstack/router-plugin  class-variance-authority  tw-animate-css
```

**devDependencies（核实后删）：**
```
playwright  playwright-core（如 e2e 一并移除；browser-smoke 脚本也依赖它，需同步处理）
@types/react / @types/react-dom 等若仅被死代码使用则随代码一起删
```

### 1.5 双轨实现（保留新版，删旧版）

| 旧（删除） | 新（保留） | 说明 |
|-----------|-----------|------|
| `src/data/*` 数据层 | `src/lib/market/` (feed/history/api/chart-engine) | 数据链路新版完整可用（已实测渲染正常） |
| `drawing-engine.ts` | `drawing-engine-v2.ts` | V2 被 `DrawingOverlayV2.tsx` 使用 |
| `DrawingOverlay.tsx` | `DrawingOverlayV2.tsx` | 同上 |
| `touch-gesture.ts` + `TouchGestureIntegration.tsx` | 无（孤件） | 直接删除 |
| `ApexChart.tsx` + examples + index.ts + `.storybook` | `Terminal` 组件树 | 图表库旧封装已由终端覆盖 |

### 1.6 git 卫生

- 大量未提交修改（11 个已跟踪文件 + 6 个未跟踪源文件 + .trash + 根目录文档）
- `package-lock.json` 被 gitignore 了（团队一般应提交 lockfile，但按现状不动）

---

## 二、清理方案（分四批执行）

### 🟢 第一批：安全删除（零风险，纯垃圾/死代码）

```
# 1. 调试垃圾
rm -rf .trash/
rm -f  ../KLINE_DEBUG_DIAGNOSTICS.md        # 问题已修复
rm -f  ../COMMIT_MESSAGE.md ../FINAL_SUMMARY.md ../FINAL_IMPROVEMENTS.md
rm -f  ../PHASE_COMPLETE.md ../PHASE_1_TO_3_REPORT.md
rm -f  ../CUSTOMIZATION_UPDATE.md ../QUICK_START_INTEGRATION.md
rm -f  ../INTEGRATION_SUMMARY.md ../EXTERNAL_INTEGRATION_GUIDE.md
rm -f  ../FEATURE_GAPS_COMPARISON.md ../README_PHASE_1_TO_3.md
rm -f  ../API_REFERENCE.md ../DRAWING_ENGINE_V2_SUMMARY.md
rm -f  ../INDICATOR_ENGINE_SUMMARY.md ../INVERTED_VIEW_IMPLEMENTATION.md
rm -f  ../TOUCH_GESTURE_INTEGRATION.md
rm -f  ../startup.sh  (如确定无人使用)

# 2. 死代码目录
rm -rf src/components/ApexChart.tsx src/components/examples/ src/components/index.ts
rm -rf src/data/
rm -rf src/lib/multiplayer/
rm -rf .storybook/
rm -f  src/components/terminal/TouchGestureIntegration.tsx
rm -f  src/lib/market/touch-gesture.ts
rm -f  src/components/terminal/DrawingOverlay.tsx
rm -f  src/lib/market/drawing-engine.ts
rm -f  e2e/chart.spec.ts  (旧结构测试)
```

> 删除前必须 `git add` 新实现文件，否则连带删掉未跟踪的新文件。执行时按「先提交/暂存新文件 → 再删旧文件」顺序。

### 🟡 第二批：依赖瘦身

```bash
npm uninstall date-fns date-fns-jalali recharts vaul cmdk react-resizable-panels \
  react-day-picker react-hook-form @hookform/resolvers class-variance-authority \
  tw-animate-css @tanstack/react-query @tanstack/react-table @tanstack/router-plugin \
  @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-avatar \
  @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover \
  @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area \
  @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider \
  @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle \
  @radix-ui/react-toggle-group @radix-ui/react-tooltip
```

预期：**node_modules 从 359MB 降至 ~150-180MB**，安装时间减半。

> 注意：`lightningcss`、`nitro` 等是 vite/tanstack 的传递依赖或直接用于构建，**不能删**；
> `sonner`、`zustand`、`lucide-react`、`better-auth`、`jose`、`pg`、`kysely`、`@electric-sql/pglite`、`zod` 在用，保留。

### 🟠 第三批：收敛与重构（中等风险，需验证）

1. **清理未跟踪源码文件的定位**：`CustomIndicatorModal.tsx`、`DrawingOverlayV2.tsx`、`drawing-engine-v2.ts`、`indicator-engine.ts`、`script-parser.ts` 是新功能文件且已被引用 —— **保留并提交**（它们不是垃圾，是未提交的功能）。
2. **移除调试日志**：全库 grep `console.log('[WS]`、`console.log('[History]`、`[ChartPane]` 等残留，只留关键错误日志。
3. **`Header.tsx` 里 SVG 属性驼峰化**（已改，随提交走）。
4. **`src/lib/app-data/`、`src/lib/auth/`（19 文件）**：被 `__root.tsx` 和 `AuthProvider` 引用，属于登录/预览基建 —— **保留**，但可评估是否被实际使用（`VITE_AUTH_ENABLED` 未开启时走旁路）。
5. **`server/` + `public/__grok/`**：PWA/install 页面基建，`grokPwaPlugin` 在用 —— **保留**。

### 🔴 第四批：可选深度优化（需用户确认）

| 项 | 收益 | 风险 |
|----|------|------|
| 移除 auth/app-data 整套（19+ 文件，若项目无需登录） | 删 ~2,000 行 | 需要确认部署不需要 OAuth |
| 移除 `better-auth`/`jose`/`pg`/`kysely`/`@electric-sql/pglite` | 再减 ~40MB | 同上 |
| 用 `npm pkg delete scripts.*` 清理不用的构建脚本（brand-check/browser-smoke/preview 等生成器脚本） | 删 ~1,500 行 | 需保留 `dev/build`/`migrate` |
| `routeTree.gen.ts` 交由插件自动生成 | 减一个文件 | 保持现状即可 |
| 合并 `lib/market/settings.ts` + `useChartSettings.ts` | 减 ~100 行 | 低风险 |

---

## 三、执行顺序与验证门禁

```
Step 0  备份：git stash / 创建清理分支 cleanup/slim-down（强烈建议 worktree 或分支）
Step 1  第一批删除（纯死代码）→ tsc --noEmit + 启动 dev + Playwright 冒烟（K线渲染、WS、盘口）
Step 2  第二批依赖卸载 → npm install 后重新冒烟
Step 3  第三批收敛 → 全量 tsc + 冒烟
Step 4  第四批（仅用户确认后）→ 同上
每个 Step 完成后：git commit 一个原子提交，可回滚
```

**冒烟测试验收标准**（复用上一轮验证脚本思路）：
- `bars.length > 1000`、`historyStatus.phase === "complete"`
- canvas 有红绿蜡烛像素
- 页面无 `ReferenceError` / 404 资源

---

## 四、预期收益

| 指标 | 清理前 | 清理后（预估） |
|------|--------|---------------|
| `src/` 代码行 | ~16,000 | ~9,000（-45%） |
| node_modules | 359 MB | ~160 MB（-55%） |
| 依赖项 | ~70 | ~45（-36%） |
| .trash / 临时文件 | 4.5 MB / 49 个 | 0 |
| 根目录 MD | 17 个 | 0（或归档到 docs/） |

---

## 五、明确不动的部分

- `src/lib/market/*` 新版图表引擎（chart-engine/feed/history/indicator-engine/drawing-engine-v2/script-parser）
- `src/components/terminal/*` 终端 UI（Terminal/ChartBoard/ChartPane/ChartToolbar 等）
- `src/lib/auth`、`src/lib/app-data`、`src/lib/db.ts`、`server/`、`public/__grok/`（基建，除非用户确认第四批）
- `vite.config.ts` 各插件（grok-pwa/app-env/auth-popup 均被引用）
- 上一轮修复的 K 线渲染逻辑
