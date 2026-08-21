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
