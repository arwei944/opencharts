import { createServerFn } from "@tanstack/react-start";
import { env } from "@/lib/env.server";
import { okxInstId, okxSign } from "./sign";

/**
 * Server-side OKX live-trading proxy — symmetric to lib/binance/proxy.ts.
 * Keys come from OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE env vars and
 * never reach the browser.
 */

export type OkxAction =
  "balance" | "positions" | "placeOrder" | "cancelOrder" | "openOrders";

interface EndpointSpec {
  method: string;
  path: string;
}

const ENDPOINTS: Record<OkxAction, EndpointSpec> = {
  balance: { method: "GET", path: "/api/v5/account/balance" },
  positions: { method: "GET", path: "/api/v5/account/positions" },
  placeOrder: { method: "POST", path: "/api/v5/trade/order" },
  cancelOrder: { method: "POST", path: "/api/v5/trade/cancel-order" },
  openOrders: { method: "GET", path: "/api/v5/trade/orders-pending" },
};

export type OkxLiveResult =
  { ok: true; raw: string } | { ok: false; error: string };

export const okxLive = createServerFn({ method: "POST" })
  .validator(
    (d: {
      action: OkxAction;
      market: "spot" | "usdm";
      params: Record<string, string | number>;
    }) => d,
  )
  .handler(async ({ data }): Promise<OkxLiveResult> => {
    const key = env("OKX_API_KEY");
    const secret = env("OKX_API_SECRET");
    const passphrase = env("OKX_PASSPHRASE");
    if (!key || !secret || !passphrase) {
      return {
        ok: false,
        error:
          "OKX 实盘未启用：请配置服务端环境变量 OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE",
      };
    }
    const spec = ENDPOINTS[data.action];
    if (!spec) return { ok: false, error: "未知操作" };

    // Binance-param compatibility: accept symbol/market → instId; keep pass-through.
    const { symbol, ...rest } = data.params;
    const instId =
      typeof symbol === "string" ? okxInstId(symbol, data.market) : undefined;
    const bodyParams: Record<string, string | number> = { ...rest };
    if (instId) bodyParams.instId = instId;

    const query =
      data.action === "openOrders" && instId
        ? `?instId=${encodeURIComponent(instId)}`
        : "";
    const body =
      data.action === "placeOrder" || data.action === "cancelOrder"
        ? JSON.stringify(bodyParams)
        : "";
    const requestPath = spec.path + query;
    const timestamp = String(Date.now());
    const sign = okxSign(secret, timestamp, spec.method, requestPath, body);

    const res = await fetch(`https://www.okx.com${requestPath}`, {
      method: spec.method,
      headers: {
        "OK-ACCESS-KEY": key,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
      body: body || undefined,
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      code?: string;
      msg?: string;
      data?: unknown;
    };
    if (!res.ok || (j.code && j.code !== "0")) {
      return { ok: false, error: j.msg ?? `OKX HTTP ${res.status}` };
    }
    return { ok: true, raw: JSON.stringify(j.data ?? j) };
  });
