import assert from "node:assert/strict";
import test from "node:test";
import {
  boardToScreen,
  centerOn,
  createViewport,
  locatePixel,
  pan,
  readSavedView,
  screenToBoard,
  visibleTileRange,
  writeSavedView,
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

test("centerOn puts the requested pixel at the viewport midpoint", () => {
  const viewport = centerOn(createViewport(240, 120, 1), 3, 7, 240, 120, 10);
  assert.deepEqual(screenToBoard(viewport, 120, 60, 10), { row: 3, column: 7 });
});

test("saved views restore row then column and reject garbage", () => {
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_, value) { this.value = value; },
  };
  writeSavedView(storage, { row: -4, column: 12, scale: 2, offsetX: 10, offsetY: 20 });
  assert.deepEqual(readSavedView(storage), {
    row: -4,
    column: 12,
    scale: 2,
    offsetX: 10,
    offsetY: 20,
  });
  storage.value = "{";
  assert.equal(readSavedView(storage), null);
});

test("writeSavedView ignores storage failures", () => {
  writeSavedView({
    setItem() { throw new Error("quota"); },
  }, { row: 0, column: 0, scale: 1 });
});

test("restoring a saved view recenters on the saved pixel at the current size", () => {
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_, value) { this.value = value; },
  };
  writeSavedView(storage, { row: 8, column: -3, scale: 2 });
  const saved = readSavedView(storage);
  const viewport = centerOn(
    createViewport(320, 180, saved.scale),
    saved.row,
    saved.column,
    320,
    180,
    10,
  );
  assert.deepEqual(screenToBoard(viewport, 160, 90, 10), { row: 8, column: -3 });
});
