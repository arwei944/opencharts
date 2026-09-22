import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultParamsFor } from "./indicator-defaults.ts";

const catalog = (kind: string) => {
  // MA/RSI/BOLL/MACD catalog defaults are [7,25,99] / [14] / [20,2] / [12,26,9]
  switch (kind) {
    case "MA":
      return [7, 25, 99];
    case "RSI":
      return [14];
    case "BOLL":
      return [20, 2];
    case "MACD":
      return [12, 26, 9];
    case "ATR":
      return [14];
    default:
      return [];
  }
};

test("defaultParamsFor: 1s gets short lookbacks", () => {
  assert.deepEqual(defaultParamsFor("MA", "1s", catalog("MA")), [3, 10, 25]);
  assert.deepEqual(defaultParamsFor("RSI", "1s", catalog("RSI")), [7]);
  assert.deepEqual(defaultParamsFor("BOLL", "1s", catalog("BOLL")), [10, 2]);
});

test("defaultParamsFor: 1m overrides apply where declared", () => {
  assert.deepEqual(defaultParamsFor("MA", "1m", catalog("MA")), [5, 20, 60]);
  assert.deepEqual(defaultParamsFor("EMA", "1m", catalog("MA")), [5, 20]);
});

test("defaultParamsFor: no override falls through to catalog defaults", () => {
  assert.deepEqual(defaultParamsFor("MA", "15m", catalog("MA")), [7, 25, 99]);
  assert.deepEqual(defaultParamsFor("MA", "1h", catalog("MA")), [7, 25, 99]);
});

test("defaultParamsFor: indicators without any override keep defaults", () => {
  assert.deepEqual(defaultParamsFor("ATR", "1s", catalog("ATR")), [14]);
  assert.deepEqual(defaultParamsFor("ATR", "1d", catalog("ATR")), [14]);
});
