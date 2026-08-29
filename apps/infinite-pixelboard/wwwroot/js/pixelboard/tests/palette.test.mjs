import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_COLORS,
  PRO_COLORS,
  colorsForState,
  customColorsAllowed,
} from "../palette.mjs";

test("fallback palettes keep the curated base and Pro expansion", () => {
  assert.equal(FREE_COLORS.length, 9);
  assert.equal(PRO_COLORS.length, 24);
  assert.deepEqual(PRO_COLORS.slice(0, FREE_COLORS.length), FREE_COLORS);
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
