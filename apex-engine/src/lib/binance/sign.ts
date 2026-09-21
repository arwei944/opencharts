import { createHmac } from "node:crypto";

/**
 * Binance API request signing (server-side only). Kept pure so the HMAC
 * construction is unit-testable; the proxy serverFn never exposes the secret.
 */

/** Sort keys, URL-encode values, append the HMAC-SHA256 signature. */
export function signedQueryString(
  params: Record<string, string | number>,
  secret: string,
): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${signature}`;
}

/** The query string used as the HMAC input (before signature is appended). */
export function rawQueryString(
  params: Record<string, string | number>,
): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}
