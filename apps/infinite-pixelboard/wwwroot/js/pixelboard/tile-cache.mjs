import { locatePixel } from "./viewport.mjs";

export class TileCache {
  constructor({ loadTile, tileRows = 128, tileColumns = 128, defaultColor = "#FFFFFF", maxTiles = 96 }) {
    this.loadTile = loadTile;
    this.tileRows = tileRows;
    this.tileColumns = tileColumns;
    this.defaultColor = defaultColor;
    this.maxTiles = maxTiles;
    this.tiles = new Map();
    this.pending = new Map();
    this.version = 0;
  }

  get(tileRow, tileColumn) {
    const key = tileKey(tileRow, tileColumn);
    const tile = this.tiles.get(key);
    if (tile) tile.lastUsed = performanceNow();
    return tile?.pixels ?? null;
  }

  async ensureVisible(range, signal) {
    const requests = [];
    for (let row = range.firstRow; row <= range.lastRow; row += 1) {
      for (let column = range.firstColumn; column <= range.lastColumn; column += 1) {
        requests.push(this.#load(row, column, false, signal));
      }
    }
    await Promise.allSettled(requests);
    this.#evict();
  }

  async refreshVisible(range, signal) {
    const requests = [];
    for (let row = range.firstRow; row <= range.lastRow; row += 1) {
      for (let column = range.firstColumn; column <= range.lastColumn; column += 1) {
        requests.push(this.#load(row, column, true, signal));
      }
    }
    await Promise.allSettled(requests);
    this.#evict();
  }

  hasAll(range) {
    for (let row = range.firstRow; row <= range.lastRow; row += 1) {
      for (let column = range.firstColumn; column <= range.lastColumn; column += 1) {
        if (!this.tiles.has(tileKey(row, column))) return false;
      }
    }
    return true;
  }

  applyPixel(row, column, color) {
    const location = locatePixel(row, column, this.tileRows, this.tileColumns);
    const key = tileKey(location.tileRow, location.tileColumn);
    let entry = this.tiles.get(key);
    if (!entry) {
      entry = {
        pixels: createEmptyTile(this.tileRows, this.tileColumns, this.defaultColor),
        lastUsed: performanceNow(),
        mutations: new Map(),
      };
      this.tiles.set(key, entry);
    }
    const previous = {
      color: entry.pixels[location.offsetRow][location.offsetColumn],
      version: entry.mutations.get(offsetKey(location.offsetRow, location.offsetColumn)) ?? 0,
    };
    const version = ++this.version;
    entry.pixels[location.offsetRow][location.offsetColumn] = color;
    entry.mutations.set(offsetKey(location.offsetRow, location.offsetColumn), version);
    return { previous, version };
  }

  applyPixelIfLoaded(row, column, color) {
    const location = locatePixel(row, column, this.tileRows, this.tileColumns);
    if (!this.tiles.has(tileKey(location.tileRow, location.tileColumn))) return false;
    this.applyPixel(row, column, color);
    return true;
  }

  restorePixel(row, column, color, expectedVersion) {
    const location = locatePixel(row, column, this.tileRows, this.tileColumns);
    const entry = this.tiles.get(tileKey(location.tileRow, location.tileColumn));
    const key = offsetKey(location.offsetRow, location.offsetColumn);
    if (!entry || entry.mutations.get(key) !== expectedVersion) return false;
    entry.pixels[location.offsetRow][location.offsetColumn] = color;
    entry.mutations.set(key, ++this.version);
    return true;
  }

  #load(tileRow, tileColumn, force, signal) {
    const key = tileKey(tileRow, tileColumn);
    if (!force && this.tiles.has(key)) {
      this.get(tileRow, tileColumn);
      return Promise.resolve();
    }
    if (this.pending.has(key)) {
      const pending = this.pending.get(key);
      return force
        ? pending.then(() => this.#load(tileRow, tileColumn, true, signal))
        : pending;
    }

    const versionAtStart = this.version;
    const request = this.loadTile(tileRow, tileColumn, signal)
      .then((snapshot) => {
        if (!isTile(snapshot?.pixels, this.tileRows, this.tileColumns)) {
          throw new TypeError(`Tile ${key} did not match the frozen row/column shape.`);
        }
        const existing = this.tiles.get(key);
        const mutations = new Map();
        if (existing) {
          for (const [offset, version] of existing.mutations) {
            if (version <= versionAtStart) continue;
            const [row, column] = offset.split(":").map(Number);
            snapshot.pixels[row][column] = existing.pixels[row][column];
            mutations.set(offset, version);
          }
        }
        this.tiles.set(key, {
          pixels: snapshot.pixels,
          lastUsed: performanceNow(),
          mutations,
        });
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  #evict() {
    if (this.tiles.size <= this.maxTiles) return;
    const oldest = [...this.tiles.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      .slice(0, this.tiles.size - this.maxTiles);
    for (const [key] of oldest) this.tiles.delete(key);
  }
}

export function tileKey(row, column) {
  return `${row}:${column}`;
}

function offsetKey(row, column) {
  return `${row}:${column}`;
}

function createEmptyTile(rows, columns, color) {
  return Array.from({ length: rows }, () => Array(columns).fill(color));
}

function isTile(pixels, rows, columns) {
  return Array.isArray(pixels)
    && pixels.length === rows
    && pixels.every((row) => Array.isArray(row) && row.length === columns);
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
