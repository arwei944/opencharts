import { createServerFn } from "@tanstack/react-start";
import { env } from "@/lib/env.server";
import { signedQueryString } from "./sign";

/**
 * Server-side Binance live-trading proxy. The API secret never leaves the
 * server: the client sends an action + plain params, and this handler signs
 * the request with BINANCE_API_KEY / BINANCE_API_SECRET env vars.
 *
 *   - key:      BINANCE_API_KEY
 *   - secret:   BINANCE_API_SECRET
 * Configure them in the server environment to enable live trading; until then
 * every action returns a clear { ok: false } message and the UI stays on the
 * paper broker.
 */

export type BinanceAction =
  "balance" | "positions" | "placeOrder" | "cancelOrder" | "openOrders";

interface EndpointSpec {
  method: string;
  path: string;
}

const SPOT_ENDPOINTS: Record<BinanceAction, EndpointSpec> = {
  balance: { method: "GET", path: "/api/v3/account" },
  positions: { method: "GET", path: "/api/v3/account" },
  placeOrder: { method: "POST", path: "/api/v3/order" },
  cancelOrder: { method: "DELETE", path: "/api/v3/order" },
  openOrders: { method: "GET", path: "/api/v3/openOrders" },
};

const USDM_ENDPOINTS: Record<BinanceAction, EndpointSpec> = {
  balance: { method: "GET", path: "/fapi/v2/account" },
  positions: { method: "GET", path: "/fapi/v2/positionRisk" },
  placeOrder: { method: "POST", path: "/fapi/v1/order" },
  cancelOrder: { method: "DELETE", path: "/fapi/v1/order" },
  openOrders: { method: "GET", path: "/fapi/v1/openOrders" },
};

export type BinanceLiveResult =
  { ok: true; raw: string } | { ok: false; error: string };

export const binanceLive = createServerFn({ method: "POST" })
  .validator(
    (d: {
      action: BinanceAction;
      market: "spot" | "usdm";
      params: Record<string, string | number>;
    }) => d,
  )
  .handler(async ({ data }): Promise<BinanceLiveResult> => {
    const key = env("BINANCE_API_KEY");
    const secret = env("BINANCE_API_SECRET");
    if (!key || !secret) {
      return {
        ok: false,
        error:
          "实盘未启用：请配置服务端环境变量 BINANCE_API_KEY / BINANCE_API_SECRET",
      };
    }
    const endpoints = data.market === "spot" ? SPOT_ENDPOINTS : USDM_ENDPOINTS;
    const spec = endpoints[data.action];
    if (!spec) return { ok: false, error: "未知操作" };
    const base =
      data.market === "spot"
        ? "https://api.binance.com"
        : "https://fapi.binance.com";
    const params: Record<string, string | number> = {
      ...data.params,
      timestamp: Date.now(),
      recvWindow: 5000,
    };
    const qs = signedQueryString(params, secret);
    const url = `${base}${spec.path}?${qs}`;
    const res = await fetch(url, {
      method: spec.method,
      headers: { "X-MBX-APIKEY": key },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      msg?: string;
      code?: number;
    };
    if (!res.ok) {
      return { ok: false, error: body.msg ?? `币安 HTTP ${res.status}` };
    }
    // Serialize explicitly so the serverFn payload stays JSON-safe.
    return { ok: true, raw: JSON.stringify(body) };
  });
