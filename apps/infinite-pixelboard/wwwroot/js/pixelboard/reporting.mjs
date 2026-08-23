export function boundedReportRegion(position, width, height) {
  const boundedWidth = boundedDimension(width);
  const boundedHeight = boundedDimension(height);
  return {
    top: position.row - Math.floor((boundedHeight - 1) / 2),
    left: position.column - Math.floor((boundedWidth - 1) / 2),
    width: boundedWidth,
    height: boundedHeight,
  };
}

function boundedDimension(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(64, number));
}
