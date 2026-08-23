import assert from "node:assert/strict";
import test from "node:test";
import {
  boardToScreen,
  createViewport,
  locatePixel,
  pan,
  screenToBoard,
  visibleTileRange,
  zoomAt,
} from "../viewport.mjs";

test("screen and board transforms preserve frozen row then column coordinates", () => {
  const viewport = { offsetX: 100, offsetY: 50, scale: 2 };
  const screen = boardToScreen(viewport, 3, -4, 10);

  assert.deepEqual(screen, { x: 20, y: 110 });
  assert.deepEqual(screenToBoard(viewport, screen.x + 1, screen.y + 1, 10), {
    row: 3,
    column: -4,
  });
});

test("negative coordinates use floor-based tiles and positive offsets", () => {
  assert.deepEqual(locatePixel(-1, -129, 128, 128), {
    tileRow: -1,
    tileColumn: -2,
    offsetRow: 127,
    offsetColumn: 127,
  });
});

test("zoom keeps the board point beneath the pointer fixed", () => {
  const viewport = createViewport(800, 600);
  const before = screenToBoard(viewport, 275, 210);
  const zoomed = zoomAt(viewport, 275, 210, 1.8);

  assert.deepEqual(screenToBoard(zoomed, 275, 210), before);
});

test("pan and visible tile range cover the viewport", () => {
  const viewport = pan(createViewport(256, 256), -128, -128);
  assert.deepEqual(visibleTileRange(viewport, 256, 256, 128, 128, 1), {
    firstRow: 0,
    lastRow: 2,
    firstColumn: 0,
    lastColumn: 2,
  });
});
