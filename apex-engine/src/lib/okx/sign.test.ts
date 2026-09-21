import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { okxInstId, okxSign } from "./sign.ts";

const SECRET = "test-secret-0123456789";

describe("okx sign.okxSign", () => {
  it("signs timestamp+method+path+body with base64 HMAC-SHA256", () => {
    const out = okxSign(
      SECRET,
      "1700000000000",
      "POST",
      "/api/v5/trade/order",
      '{"instId":"BTC-USDT"}',
    );
    const expected = createHmac("sha256", SECRET)
      .update(
        "1700000000000" +
          "POST" +
          "/api/v5/trade/order" +
          '{"instId":"BTC-USDT"}',
      )
      .digest("base64");
    assert.equal(out, expected);
    // base64 HMAC-SHA256 is 44 chars with padding
    assert.match(out, /^[A-Za-z0-9+/]{43}=$/);
  });

  it("GET requests sign an empty body", () => {
    const out = okxSign(
      SECRET,
      "1700000000000",
      "GET",
      "/api/v5/account/balance",
      "",
    );
    const expected = createHmac("sha256", SECRET)
      .update("1700000000000" + "GET" + "/api/v5/account/balance" + "")
      .digest("base64");
    assert.equal(out, expected);
  });

  it("is deterministic", () => {
    assert.equal(
      okxSign(SECRET, "1", "GET", "/x", ""),
      okxSign(SECRET, "1", "GET", "/x", ""),
    );
  });
});

describe("okx sign.okxInstId", () => {
  it("maps spot and usdm instruments", () => {
    assert.equal(okxInstId("BTC", "spot"), "BTC-USDT");
    assert.equal(okxInstId("BTC", "usdm"), "BTC-USDT-SWAP");
  });
});
