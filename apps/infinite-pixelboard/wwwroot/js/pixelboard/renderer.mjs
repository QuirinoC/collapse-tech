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

  draw(viewport, cache, highlightedPixel = null, reportRegion = null) {
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

    if (highlightedPixel) drawHighlight(context, viewport, highlightedPixel, cell, this.cellSize);
    if (reportRegion) drawReportRegion(context, viewport, reportRegion, cell, this.cellSize);
    return range;
  }

}

function drawTile(context, pixels, x, y, cell, defaultColor) {
  // Expand fills by 1 CSS px so adjacent pixels (and neighboring network tiles)
  // abut without hairline gaps from floor/ceil rounding.
  const span = Math.max(1, Math.ceil(cell) + 1);
  for (let row = 0; row < pixels.length; row += 1) {
    for (let column = 0; column < pixels[row].length; column += 1) {
      const color = pixels[row][column];
      if (!color || color.toUpperCase() === defaultColor) continue;
      context.fillStyle = color;
      context.fillRect(
        Math.floor(x + column * cell),
        Math.floor(y + row * cell),
        span,
        span,
      );
    }
  }
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

function drawReportRegion(context, viewport, region, cell, cellSize) {
  const point = boardToScreen(viewport, region.top, region.left, cellSize);
  context.fillStyle = "rgba(211, 82, 60, .12)";
  context.strokeStyle = "#d3523c";
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.fillRect(point.x, point.y, region.width * cell, region.height * cell);
  context.strokeRect(point.x, point.y, region.width * cell, region.height * cell);
  context.setLineDash([]);
}
