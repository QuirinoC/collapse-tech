import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packsDir = join(dirname(fileURLToPath(import.meta.url)), "packs");
const hex = /^#[0-9A-Fa-f]{6}$/;

test("mural seed packs are original CC0 payloads with valid pixels", async () => {
  const files = (await readdir(packsDir)).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 20, `expected many packs, got ${files.length}`);

  let total = 0;
  for (const name of files) {
    const pack = JSON.parse(await readFile(join(packsDir, name), "utf8"));
    assert.equal(pack.id + ".json", name);
    assert.match(pack.license, /CC0|public-domain/i);
    assert.ok(Array.isArray(pack.pixels) && pack.pixels.length > 0);
    for (const pixel of pack.pixels) {
      assert.equal(typeof pixel.row, "number");
      assert.equal(typeof pixel.column, "number");
      assert.match(pixel.color, hex);
    }
    total += pack.pixels.length;
  }
  assert.ok(total > 1000, `expected a bunch of pixels, got ${total}`);
});
