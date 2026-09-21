import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatTime } from "./timefmt.ts";

// 2026-01-15 12:00:00 UTC (winter) and 2026-07-15 12:00:00 UTC (summer, DST).
const WINTER = Date.UTC(2026, 0, 15, 12, 0, 0) / 1000;
const SUMMER = Date.UTC(2026, 6, 15, 12, 0, 0) / 1000;

describe("timefmt", () => {
  it("UTC stays identical", () => {
    assert.equal(formatTime(WINTER, "UTC"), "12:00");
  });

  it("UTC+8 is 8 hours ahead", () => {
    assert.equal(formatTime(WINTER, "Etc/GMT-8"), "20:00");
  });

  it("New York is 5h behind in winter, 4h behind in summer (DST)", () => {
    assert.equal(formatTime(WINTER, "America/New_York"), "07:00");
    assert.equal(formatTime(SUMMER, "America/New_York"), "08:00");
  });

  it("Los Angeles follows PDT/PST rules", () => {
    assert.equal(formatTime(WINTER, "America/Los_Angeles"), "04:00");
    assert.equal(formatTime(SUMMER, "America/Los_Angeles"), "05:00");
  });

  it("formatDateTime includes the date", () => {
    assert.equal(formatDateTime(WINTER, "UTC", true), "15/01/2026, 12:00");
  });

  it("handles garbage input", () => {
    assert.equal(formatTime(Number.NaN, "UTC"), "—");
    assert.equal(formatTime(Infinity, "UTC"), "—");
  });
});
