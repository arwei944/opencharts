import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activateIndicator,
  deactivateDrawingTool,
  deactivateIndicator,
  drawingTools,
  getIndicator,
  indicatorCatalog,
  isDrawingToolActive,
  isIndicatorActive,
  registerDrawingTool,
  registerIndicator,
  unregisterIndicator,
} from "./registry.ts";
import { computeIndicator } from "../market/indicator-compute.ts";
import { TOOLS } from "../market/constants.ts";
import type { Candle } from "../market/types.ts";

const bars: Candle[] = [
  { time: 0, open: 1, high: 2, low: 0.5, close: 1, volume: 10 },
  { time: 60, open: 1, high: 3, low: 1, close: 2, volume: 20 },
  { time: 120, open: 2, high: 5, low: 2, close: 3, volume: 30 },
];

function fakePlugin() {
  registerIndicator({
    kind: "SQUARED",
    name: "平方线",
    group: "sub",
    defaults: [2],
    labels: ["幂"],
    // Linear in close — passes the renderer's smoothness guard, so the test
    // asserts dispatch, not the guard.
    compute: (b) => b.map((x) => ({ time: x.time, value: x.close * 0.5 })),
  });
}

test("register → active by default; catalog merges builtin + plugin", () => {
  fakePlugin();
  const cat = indicatorCatalog();
  assert.ok(
    cat.find((x) => x.kind === "SQUARED"),
    "plugin kind present",
  );
  assert.ok(
    cat.find((x) => x.kind === "MA"),
    "builtin kind still present",
  );
  assert.ok(cat.length > TOOLS.length); // catalog vs tools sanity
  assert.equal(isIndicatorActive("SQUARED"), true);
});

test("deactivate hides from catalog but keeps the definition", () => {
  fakePlugin();
  deactivateIndicator("SQUARED");
  assert.equal(
    indicatorCatalog().some((x) => x.kind === "SQUARED"),
    false,
    "hidden from UI catalog",
  );
  assert.ok(getIndicator("SQUARED"), "definition kept for late activation");
  assert.equal(isIndicatorActive("SQUARED"), false);
  activateIndicator("SQUARED");
  assert.equal(
    indicatorCatalog().some((x) => x.kind === "SQUARED"),
    true,
  );
});

test("unregister removes definition and active flag", () => {
  fakePlugin();
  unregisterIndicator("SQUARED");
  assert.equal(getIndicator("SQUARED"), undefined);
  assert.equal(isIndicatorActive("SQUARED"), false);
});

test("drawingTools merges builtin toolbar + active plugin tools", () => {
  registerDrawingTool({
    id: "xmark",
    label: "X 记号",
    points: 2,
    render: () => null,
  });
  const tools = drawingTools();
  assert.equal(tools.length, TOOLS.length + 1);
  assert.ok(tools.find((t) => t.id === "xmark"));
  assert.equal(tools.find((t) => t.id === "xmark")?.points, 2);
  deactivateDrawingTool("xmark");
  assert.equal(drawingTools().length, TOOLS.length);
  assert.equal(isDrawingToolActive("xmark"), false);
});

test("computeIndicator dispatches registered plugin kinds", () => {
  fakePlugin();
  const specs = computeIndicator("SQUARED", "s1", [], bars, {}, { value: 1 });
  assert.equal(specs.length, 1);
  const line = specs[0];
  assert.equal(line.type, "line");
  assert.deepEqual(
    line.data.map((d) => d.value),
    [0.5, 1, 1.5],
  );
  assert.equal(line.key, "s1-plugin");
});

test("computeIndicator ignores unknown plugin-ish kinds", () => {
  const specs = computeIndicator("NOPE", "x", [], bars, {}, { value: 1 });
  assert.deepEqual(specs, []);
});

test("plugin catalog entry carries defaults + labels for addIndicator", () => {
  fakePlugin();
  const entry = indicatorCatalog().find((x) => x.kind === "SQUARED");
  assert.deepEqual(entry?.defaults, [2]);
  assert.deepEqual(entry?.labels, ["幂"]);
  assert.equal(entry?.group, "sub");
});

test("settingsSection: register + list + unregister", async () => {
  const mod = await import("./registry.ts");
  mod.registerSettingsSection({
    id: "test.sec",
    title: "测试分区",
    render: () => null,
  });
  assert.equal(
    mod.listSettingsSections().some((s) => s.id === "test.sec"),
    true,
  );
  assert.equal(
    mod.listSettingsSections().find((s) => s.id === "test.sec")?.title,
    "测试分区",
  );
  mod.unregisterSettingsSection("test.sec");
  assert.equal(
    mod.listSettingsSections().some((s) => s.id === "test.sec"),
    false,
  );
});
