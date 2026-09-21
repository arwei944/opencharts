import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { rawQueryString, signedQueryString } from "./sign.ts";

const SECRET = "NHqPUGU0wG3jR0geWx8gMz5BGJYc2yS1aJx3NzN6Cqk";

describe("binance sign.signedQueryString", () => {
  it("sorts keys, URL-encodes values and appends the HMAC hex signature", () => {
    const out = signedQueryString(
      {
        symbol: "LTCBTC",
        timestamp: 1499827319559,
        recvWindow: 5000,
      },
      SECRET,
    );
    // query part sorted: recvWindow, symbol, timestamp
    assert.ok(
      out.startsWith(
        "recvWindow=5000&symbol=LTCBTC&timestamp=1499827319559&signature=",
      ),
    );
    const sig = out.split("signature=")[1];
    assert.equal(sig.length, 64); // sha256 hex
    assert.match(sig, /^[0-9a-f]{64}$/);
  });

  it("matches an independently computed HMAC", () => {
    const params = {
      symbol: "BTCUSDT",
      quantity: 0.5,
      timestamp: 1700000000123,
      recvWindow: 5000,
    };
    const q = rawQueryString(params);
    const expected = createHmac("sha256", SECRET).update(q).digest("hex");
    const out = signedQueryString(params, SECRET);
    assert.equal(out.split("signature=")[1], expected);
  });

  it("is deterministic for identical inputs", () => {
    const p = { a: 1, b: "x y" };
    assert.equal(signedQueryString(p, SECRET), signedQueryString(p, SECRET));
  });

  it("encodes reserved characters in values", () => {
    const q = rawQueryString({ price: "0.01100000", type: "LIMIT TEST" });
    assert.ok(q.includes("type=LIMIT%20TEST"));
  });
});
