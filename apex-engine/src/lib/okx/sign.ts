import { createHmac } from "node:crypto";

/**
 * OKX API request signing (server-side only). Unlike Binance's query-string
 * HMAC, OKX signs `timestamp + method + requestPath + body` with HMAC-SHA256
 * and base64-encodes it, passing it in the OK-ACCESS-SIGN header.
 */

export function okxSign(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
): string {
  const msg = timestamp + method.toUpperCase() + requestPath + body;
  return createHmac("sha256", secret).update(msg).digest("base64");
}

/** instId mapping: spot "BTC-USDT", usdm "BTC-USDT-SWAP". */
export function okxInstId(symbol: string, market: "spot" | "usdm"): string {
  return `${symbol}-USDT${market === "usdm" ? "-SWAP" : ""}`;
}
