import { boardToScreen, DEFAULT_CELL_SIZE, visibleTileRange } from "./viewport.mjs";

export class PixelRenderer {
  constructor(canvas, { tileRows, tileColumns, defaultColor, cellSize = DEFAULT_CELL_SIZE }) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.tileRows = tileRows;
    this.tileColumns = tileColumns;
    this.defaultColor = defaultColor.toUpperCase();
    this.cellSize = cellSize;
    this.width = 0;
    this.height = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.context.imageSmoothingEnabled = false;
  }

  draw(viewport, cache, highlightedPixel = null) {
    const context = this.context;
    const cell = this.cellSize * viewport.scale;
    const range = visibleTileRange(
      viewport,
      this.width,
      this.height,
      this.tileRows,
      this.tileColumns,
      this.cellSize,
    );

    context.fillStyle = "#eee8dc";
    context.fillRect(0, 0, this.width, this.height);

    for (let tileRow = range.firstRow; tileRow <= range.lastRow; tileRow += 1) {
      for (let tileColumn = range.firstColumn; tileColumn <= range.lastColumn; tileColumn += 1) {
        const pixels = cache.get(tileRow, tileColumn);
        if (!pixels) continue;
        const origin = boardToScreen(
          viewport,
          tileRow * this.tileRows,
          tileColumn * this.tileColumns,
          this.cellSize,
        );
        drawTile(context, pixels, origin.x, origin.y, cell, this.defaultColor);
      }
    }

    drawGrid(context, viewport, this.width, this.height, cell, this.tileRows, this.tileColumns);
    if (highlightedPixel) drawHighlight(context, viewport, highlightedPixel, cell, this.cellSize);
    return range;
  }
}

function drawTile(context, pixels, x, y, cell, defaultColor) {
  for (let row = 0; row < pixels.length; row += 1) {
    for (let column = 0; column < pixels[row].length; column += 1) {
      const color = pixels[row][column];
      if (!color || color.toUpperCase() === defaultColor) continue;
      context.fillStyle = color;
      context.fillRect(
        Math.floor(x + column * cell),
        Math.floor(y + row * cell),
        Math.ceil(cell),
        Math.ceil(cell),
      );
    }
  }
}

function drawGrid(context, viewport, width, height, cell, tileRows, tileColumns) {
  if (cell >= 5) {
    const firstColumn = Math.floor(-viewport.offsetX / cell);
    const lastColumn = Math.ceil((width - viewport.offsetX) / cell);
    const firstRow = Math.floor(-viewport.offsetY / cell);
    const lastRow = Math.ceil((height - viewport.offsetY) / cell);
    context.beginPath();
    context.strokeStyle = "rgba(23, 23, 20, .10)";
    context.lineWidth = 1;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = Math.round(viewport.offsetX + column * cell) + .5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = Math.round(viewport.offsetY + row * cell) + .5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
  }

  const tileWidth = cell * tileColumns;
  const tileHeight = cell * tileRows;
  context.beginPath();
  context.strokeStyle = "rgba(23, 23, 20, .32)";
  context.lineWidth = 1;
  for (let column = Math.floor(-viewport.offsetX / tileWidth); viewport.offsetX + column * tileWidth <= width; column += 1) {
    const x = Math.round(viewport.offsetX + column * tileWidth) + .5;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let row = Math.floor(-viewport.offsetY / tileHeight); viewport.offsetY + row * tileHeight <= height; row += 1) {
    const y = Math.round(viewport.offsetY + row * tileHeight) + .5;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();
}

function drawHighlight(context, viewport, pixel, cell, cellSize) {
  const point = boardToScreen(viewport, pixel.row, pixel.column, cellSize);
  context.strokeStyle = "#d3523c";
  context.lineWidth = 2;
  context.strokeRect(
    Math.floor(point.x) + 1,
    Math.floor(point.y) + 1,
    Math.max(1, Math.ceil(cell) - 2),
    Math.max(1, Math.ceil(cell) - 2),
  );
}
