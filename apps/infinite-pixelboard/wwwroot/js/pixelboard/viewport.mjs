export const DEFAULT_CELL_SIZE = 12;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 6;

export function createViewport(width, height, scale = 1) {
  return {
    offsetX: width / 2,
    offsetY: height / 2,
    scale: clamp(scale, MIN_SCALE, MAX_SCALE),
  };
}

export function screenToBoard(viewport, x, y, cellSize = DEFAULT_CELL_SIZE) {
  const size = cellSize * viewport.scale;
  return {
    row: Math.floor((y - viewport.offsetY) / size),
    column: Math.floor((x - viewport.offsetX) / size),
  };
}

export function boardToScreen(viewport, row, column, cellSize = DEFAULT_CELL_SIZE) {
  const size = cellSize * viewport.scale;
  return {
    x: column * size + viewport.offsetX,
    y: row * size + viewport.offsetY,
  };
}

export function pan(viewport, deltaX, deltaY) {
  return {
    ...viewport,
    offsetX: viewport.offsetX + deltaX,
    offsetY: viewport.offsetY + deltaY,
  };
}

export function zoomAt(viewport, x, y, factor) {
  const nextScale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = nextScale / viewport.scale;
  return {
    scale: nextScale,
    offsetX: x - (x - viewport.offsetX) * ratio,
    offsetY: y - (y - viewport.offsetY) * ratio,
  };
}

export function centerOn(viewport, row, column, width, height, cellSize = DEFAULT_CELL_SIZE) {
  const size = cellSize * viewport.scale;
  return {
    ...viewport,
    offsetX: width / 2 - (column + 0.5) * size,
    offsetY: height / 2 - (row + 0.5) * size,
  };
}

export const SAVED_VIEW_KEY = "pixelboard.savedView";

export function readSavedView(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SAVED_VIEW_KEY) ?? "");
    if (!Number.isSafeInteger(parsed?.row) || !Number.isSafeInteger(parsed?.column)) {
      return null;
    }
    const scale = Number(parsed.scale);
    if (!Number.isFinite(scale)) return null;
    const offsetX = Number(parsed.offsetX);
    const offsetY = Number(parsed.offsetY);
    return {
      row: parsed.row,
      column: parsed.column,
      scale: clamp(scale, MIN_SCALE, MAX_SCALE),
      offsetX: Number.isFinite(offsetX) ? offsetX : 0,
      offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    };
  } catch {
    return null;
  }
}

export function writeSavedView(storage, view) {
  try {
    storage.setItem(SAVED_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Private mode and quota errors must not break the board.
  }
}

export function visibleTileRange(viewport, width, height, tileRows, tileColumns, cellSize = DEFAULT_CELL_SIZE) {
  const topLeft = screenToBoard(viewport, 0, 0, cellSize);
  const bottomRight = screenToBoard(viewport, width, height, cellSize);
  return {
    firstRow: floorDivide(topLeft.row, tileRows),
    lastRow: floorDivide(bottomRight.row, tileRows),
    firstColumn: floorDivide(topLeft.column, tileColumns),
    lastColumn: floorDivide(bottomRight.column, tileColumns),
  };
}

export function locatePixel(row, column, tileRows, tileColumns) {
  return {
    tileRow: floorDivide(row, tileRows),
    tileColumn: floorDivide(column, tileColumns),
    offsetRow: positiveModulo(row, tileRows),
    offsetColumn: positiveModulo(column, tileColumns),
  };
}

function floorDivide(value, divisor) {
  return Math.floor(value / divisor);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
