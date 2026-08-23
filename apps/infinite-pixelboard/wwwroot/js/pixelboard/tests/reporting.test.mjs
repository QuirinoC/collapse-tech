import assert from "node:assert/strict";
import test from "node:test";
import { boundedReportRegion } from "../reporting.mjs";

test("report regions remain centered using row then column coordinates", () => {
  assert.deepEqual(boundedReportRegion({ row: -4, column: 12 }, 8, 8), {
    top: -7,
    left: 9,
    width: 8,
    height: 8,
  });
});

test("report dimensions are integral and bounded to the server contract", () => {
  assert.deepEqual(boundedReportRegion({ row: 0, column: 0 }, 999, 0), {
    top: 0,
    left: -31,
    width: 64,
    height: 1,
  });
});
