import assert from "node:assert/strict";
import test from "node:test";
import { TileCache } from "../tile-cache.mjs";

function tile(color = "#FFFFFF", size = 2) {
  return Array.from({ length: size }, () => Array(size).fill(color));
}

test("visible tile loads are deduplicated and cached by row then column", async () => {
  const calls = [];
  const cache = new TileCache({
    tileRows: 2,
    tileColumns: 2,
    loadTile: async (row, column) => {
      calls.push([row, column]);
      return { pixels: tile(`${row}:${column}`) };
    },
  });
  const range = { firstRow: -1, lastRow: 0, firstColumn: 2, lastColumn: 2 };

  await Promise.all([cache.ensureVisible(range), cache.ensureVisible(range)]);

  assert.deepEqual(calls, [[-1, 2], [0, 2]]);
  assert.equal(cache.get(-1, 2)[0][0], "-1:2");
});

test("pixel updates respect negative tile offsets", () => {
  const cache = new TileCache({
    tileRows: 2,
    tileColumns: 2,
    loadTile: async () => ({ pixels: tile() }),
  });

  const mutation = cache.applyPixel(-1, -1, "#123456");

  assert.equal(mutation.previous.color, "#FFFFFF");
  assert.equal(cache.get(-1, -1)[1][1], "#123456");
});

test("a tile response cannot overwrite a placement made while it was loading", async () => {
  let finish;
  const cache = new TileCache({
    tileRows: 2,
    tileColumns: 2,
    loadTile: () => new Promise((resolve) => { finish = resolve; }),
  });
  const loading = cache.ensureVisible({ firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 0 });

  cache.applyPixel(0, 0, "#123456");
  finish({ pixels: tile() });
  await loading;

  assert.equal(cache.get(0, 0)[0][0], "#123456");
});

test("refresh replaces mutations that predate the authoritative request", async () => {
  const cache = new TileCache({
    tileRows: 2,
    tileColumns: 2,
    loadTile: async () => ({ pixels: tile("#ABCDEF") }),
  });
  cache.applyPixel(0, 0, "#123456");

  await cache.refreshVisible({ firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 0 });

  assert.equal(cache.get(0, 0)[0][0], "#ABCDEF");
});

test("malformed server tiles are rejected instead of corrupting the cache", async () => {
  const cache = new TileCache({
    tileRows: 2,
    tileColumns: 2,
    loadTile: async () => ({ pixels: [["#FFFFFF"]] }),
  });

  await cache.ensureVisible({ firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 0 });

  assert.equal(cache.get(0, 0), null);
});
