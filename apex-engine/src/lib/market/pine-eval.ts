import type { Candle } from "./types";
import { ema, rsi, sma } from "./indicators.ts";

/**
 * Lightweight Pine-Script subset evaluator (multi-output indicators).
 *
 * Supports a pragmatic slice of Pine v5 used by most custom indicators:
 *   - indicator("Name", overlay=true) declaration
 *   - input.int(def, "Label") parameter declarations
 *   - per-bar variable lines: `name = expr`
 *   - persistent state: `var name = expr` (init once) + `name := expr`
 *   - expressions: numbers, close/high/low/open/volume, sma()/ema()/rsi()/
 *     highest()/lowest()/abs(), arithmetic, comparisons, ternary, history
 *     refs (e.g. close[1]) — parsed as a small recursive-descent evaluator
 *   - multiple plot(expr, "Title") calls → one output series each
 *
 * The parser is pure and unit-tested; rendering happens through the CUSTOM
 * indicator path which now accepts multi-series results.
 */

export interface PineSeries {
  time: number;
  value: number;
}

export interface PineOutput {
  key: string;
  color: string;
  data: PineSeries[];
}

export interface PineCompiled {
  ok: boolean;
  overlay: boolean;
  params: number[];
  labels: string[];
  run: (bars: Candle[]) => PineOutput[];
  errors: string[];
}

type Env = {
  bars: Candle[];
  i: number;
  vars: Record<string, number>;
  series: Record<string, PineSeries[]>;
};

function funcArgs(expr: string): string[] {
  // top-level argument split (no nesting support — args are simple idents/numbers)
  return expr.split(",").map((s) => s.trim());
}

function isNum(s: string): boolean {
  return s !== "" && !Number.isNaN(Number(s));
}

/** Series getter used by sma/ema/rsi/highest/lowest first args (e.g. close). */
function srcSeries(expr: string, bars: Candle[]): PineSeries[] {
  if (expr === "close")
    return bars.map((b) => ({ time: b.time, value: b.close }));
  if (expr === "open")
    return bars.map((b) => ({ time: b.time, value: b.open }));
  if (expr === "high")
    return bars.map((b) => ({ time: b.time, value: b.high }));
  if (expr === "low") return bars.map((b) => ({ time: b.time, value: b.low }));
  if (expr === "volume")
    return bars.map((b) => ({ time: b.time, value: b.volume }));
  return bars.map((b) => ({ time: b.time, value: b.close }));
}

function evalAtom(atom: string, env: Env): number {
  const a = atom.trim();
  if (a === "") return 0;
  if (isNum(a)) return Number(a);
  if (a === "close") return env.bars[env.i].close;
  if (a === "open") return env.bars[env.i].open;
  if (a === "high") return env.bars[env.i].high;
  if (a === "low") return env.bars[env.i].low;
  if (a === "volume") return env.bars[env.i].volume;
  if (env.vars[a] !== undefined) return env.vars[a];
  return 0;
}

/** Evaluate one (already function-free) expression with ternary/comparisons. */
function evalExpr(expr: string, env: Env): number {
  const e = expr.trim();
  // ternary
  const q = splitTopLevel(e, "?");
  if (q.length === 2) {
    const colon = splitTopLevel(q[1], ":");
    if (colon.length === 2) {
      return evalExpr(q[0], env)
        ? evalExpr(colon[0], env)
        : evalExpr(colon[1], env);
    }
  }
  // comparisons (right-assoc stop: only first split is used)
  for (const op of [">=", "<=", "!=", "==", ">", "<"]) {
    const parts = splitTopLevel(e, op);
    if (parts.length === 2) {
      const l = evalExpr(parts[0], env);
      const r = evalExpr(parts[1], env);
      return op === ">"
        ? l > r
          ? 1
          : 0
        : op === "<"
          ? l < r
            ? 1
            : 0
          : op === ">="
            ? l >= r
              ? 1
              : 0
            : op === "<="
              ? l <= r
                ? 1
                : 0
              : op === "=="
                ? l === r
                  ? 1
                  : 0
                : l !== r
                  ? 1
                  : 0;
    }
  }
  // arithmetic
  for (const op of ["+", "-", "*", "/"]) {
    const parts = splitTopLevel(e, op);
    if (parts.length === 2) {
      const l = evalExpr(parts[0], env);
      const r = evalExpr(parts[1], env);
      return op === "+"
        ? l + r
        : op === "-"
          ? l - r
          : op === "*"
            ? l * r
            : r === 0
              ? 0
              : l / r;
    }
  }
  // history ref: close[1]
  const h = /^([a-zA-Z_][\w]*)\[(\d+)\]$/.exec(e);
  if (h) {
    const idx = Math.max(0, env.i - Number(h[2]));
    const b = env.bars[idx];
    if (!b) return 0;
    const f = h[1];
    return f === "close"
      ? b.close
      : f === "open"
        ? b.open
        : f === "high"
          ? b.high
          : f === "low"
            ? b.low
            : f === "volume"
              ? b.volume
              : 0;
  }
  return evalAtom(e, env);
}

/** Split on an operator only at the top level (no parens tracking needed for our subset). */
function splitTopLevel(s: string, op: string): string[] {
  const idx = s.indexOf(op);
  if (idx <= 0 || idx >= s.length - op.length) return [s];
  const left = s.slice(0, idx);
  const right = s.slice(idx + op.length);
  // avoid splitting inside quotes (unlikely) — fine for the subset
  return [left, right];
}

function evalCall(expr: string, env: Env): number {
  const m = /^([a-zA-Z_][\w]*)\((.*)\)$/.exec(expr.trim());
  if (!m) return evalExpr(expr, env);
  const fn = m[1];
  const args = funcArgs(m[2]);
  if (fn === "sma") {
    const src = srcSeries(args[0] ?? "close", env.bars);
    const n = Math.max(1, Number(args[1] ?? 9));
    const line = sma(
      src.map((p) => ({
        time: p.time,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        volume: 0,
      })),
      n,
      "close",
    );
    return line.find((x) => x.time === env.bars[env.i]?.time)?.value ?? 0;
  }
  if (fn === "ema") {
    const src = srcSeries(args[0] ?? "close", env.bars);
    const n = Math.max(1, Number(args[1] ?? 9));
    const line = ema(
      src.map((p) => ({
        time: p.time,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        volume: 0,
      })),
      n,
    );
    return line.find((x) => x.time === env.bars[env.i]?.time)?.value ?? 0;
  }
  if (fn === "rsi") {
    const src = srcSeries(args[0] ?? "close", env.bars);
    const n = Math.max(1, Number(args[1] ?? 14));
    const line = rsi(
      src.map((p) => ({
        time: p.time,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        volume: 0,
      })),
      n,
    );
    return line.find((x) => x.time === env.bars[env.i]?.time)?.value ?? 0;
  }
  if (fn === "highest" || fn === "lowest") {
    const n = Math.max(1, Number(args[1] ?? 10));
    let best = fn === "highest" ? -Infinity : Infinity;
    for (let k = Math.max(0, env.i - n + 1); k <= env.i; k++) {
      const v = evalAtom(args[0] ?? "high", { ...env, i: k });
      best = fn === "highest" ? Math.max(best, v) : Math.min(best, v);
    }
    return best === -Infinity || best === Infinity ? 0 : best;
  }
  if (fn === "abs") {
    return Math.abs(evalExpr(args[0] ?? "0", env));
  }
  if (fn === "max" || fn === "min") {
    const l = evalExpr(args[0] ?? "0", env);
    const r = evalExpr(args[1] ?? "0", env);
    return fn === "max" ? Math.max(l, r) : Math.min(l, r);
  }
  return evalExpr(expr, env);
}

const PLOT_COLORS = [
  "#00d4ff",
  "#f0b90b",
  "#0ecb81",
  "#f6465d",
  "#c084fc",
  "#fb7185",
];

/**
 * Compile a Pine subset script into a runnable multi-output indicator.
 * Errors are collected instead of thrown so the UI can show them inline.
 */
export function compilePine(script: string): PineCompiled {
  const errors: string[] = [];
  const src = script.replace(/\/\/.*$/gm, "").trim();
  const overlay = /indicator\([^)]*overlay\s*=\s*(true|false)/.test(src)
    ? /indicator\([^)]*overlay\s*=\s*true/.test(src)
    : true;

  const params: number[] = [];
  const labels: string[] = [];
  const inputRe = /input\.int\(\s*(\d+)\s*,\s*"([^"]+)"/g;
  let im: RegExpExecArray | null;
  while ((im = inputRe.exec(src)) !== null) {
    params.push(Number(im[1]));
    labels.push(im[2]);
  }

  // structural lines: var declarations / updates / plain assigns / plots
  interface Line {
    kind: "var" | "assign" | "update" | "plot";
    name?: string;
    expr: string;
    title?: string;
  }
  const lines: Line[] = [];
  for (const raw of src.split("\n")) {
    const ln = raw.trim();
    if (!ln) continue;
    if (/^(var\s+)?[a-zA-Z_][\w]*\s*:?=\s*/.test(ln)) {
      const vm = /^(var\s+)?([a-zA-Z_][\w]*)\s*(:?=)\s*(.+)$/.exec(ln);
      if (!vm) continue;
      const kind = vm[1]?.includes("var")
        ? "var"
        : vm[3] === ":="
          ? "update"
          : "assign";
      lines.push({ kind, name: vm[2], expr: vm[4] });
      continue;
    }
    const pm = /^plot\(\s*(.+?)\s*(?:,\s*"([^"]+)"\s*)?\)$/.exec(ln);
    if (pm) {
      lines.push({ kind: "plot", expr: pm[1], title: pm[2] });
      continue;
    }
    if (/input\.int|indicator\(|@version/.test(ln)) continue;
    if (ln.startsWith("//")) continue;
    errors.push(`无法识别的语句: ${ln.slice(0, 48)}`);
  }

  if (!lines.some((l) => l.kind === "plot")) {
    errors.push("缺少 plot() 输出声明");
  }

  const lineOrder = lines.map((l) => JSON.stringify(l));

  const run = (bars: Candle[]): PineOutput[] => {
    const stateVars: Record<string, number> = {};
    const seriesByPlot = new Map<number, PineSeries[]>();
    const plotIdx = lines
      .map((l, i) => (l.kind === "plot" ? i : -1))
      .filter((i) => i >= 0);

    for (let i = 0; i < bars.length; i++) {
      const env: Env = { bars, i, vars: stateVars, series: {} };
      for (const l of lines) {
        if (l.kind === "plot") continue;
        const v = evalCall(l.expr, env);
        if (l.kind === "var") {
          // `var` initialises once on the first bar, then persists.
          if (i === 0) stateVars[l.name!] = v;
        } else {
          // plain `=` and `:=` recompute every bar.
          stateVars[l.name!] = v;
        }
      }
      for (const pi of plotIdx) {
        const l = lines[pi];
        const v = evalCall(l.expr, env);
        const arr = seriesByPlot.get(pi) ?? [];
        arr.push({ time: bars[i].time, value: v });
        seriesByPlot.set(pi, arr);
      }
    }

    return plotIdx.map((pi, n) => ({
      key: (lines[pi] as { title?: string }).title ?? `plot${n + 1}`,
      color: PLOT_COLORS[n % PLOT_COLORS.length],
      data: seriesByPlot.get(pi) ?? [],
    }));
  };
  void lineOrder;
  return { ok: errors.length === 0, overlay, params, labels, run, errors };
}
