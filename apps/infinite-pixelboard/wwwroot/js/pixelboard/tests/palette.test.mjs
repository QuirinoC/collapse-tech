import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_COLORS,
  PRO_COLORS,
  colorName,
  colorsForState,
  customColorsAllowed,
} from "../palette.mjs";

test("fallback palettes keep the curated rainbow palettes", () => {
  assert.equal(FREE_COLORS.length, 9);
  assert.equal(PRO_COLORS.length, 24);
  for (const color of FREE_COLORS) assert.ok(PRO_COLORS.includes(color));
  assert.equal(FREE_COLORS[1], "#d3523c");
  assert.equal(FREE_COLORS[7], "#7e5078");
  assert.equal(PRO_COLORS[0], "#171714");
  assert.equal(PRO_COLORS[1], "#000000");
  assert.equal(PRO_COLORS.at(-2), "#f7f3ea");
  assert.equal(PRO_COLORS.at(-1), "#ffffff");
});

test("account contract controls the rendered palette", () => {
  const serverColors = ["#123456"];
  assert.deepEqual(
    colorsForState({ tier: "Free", allowedColors: serverColors }),
    serverColors,
  );
  assert.deepEqual(colorsForState({ tier: "Pro" }), PRO_COLORS);
  assert.deepEqual(colorsForState({ tier: "Free" }), FREE_COLORS);
});

test("custom colors are a Pro-only affordance", () => {
  assert.equal(customColorsAllowed({ tier: "Free" }), false);
  assert.equal(customColorsAllowed({ tier: "Pro" }), true);
  assert.equal(customColorsAllowed(null), false);
});

test("palette colors have accessible names", () => {
  assert.equal(colorName("#D3523C"), "Red");
  assert.equal(colorName("#171714"), "Near-black");
  assert.equal(colorName("#F7F3EA"), "Off-white");
  assert.equal(colorName("#unknown"), "#unknown");
});
