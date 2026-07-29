export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToGrid(view, cellSize, screenX, screenY) {
  return {
    x: (screenX - view.panX) / (cellSize * view.zoom),
    y: (screenY - view.panY) / (cellSize * view.zoom),
  };
}

export function gridToScreen(view, cellSize, gridX, gridY) {
  return {
    x: gridX * cellSize * view.zoom + view.panX,
    y: gridY * cellSize * view.zoom + view.panY,
  };
}

// Changes zoom while keeping the grid point under (screenX, screenY) fixed
// on screen — "zoom centered on cursor" instead of zooming from the
// viewport's corner.
export function zoomAt(view, cellSize, screenX, screenY, newZoom) {
  const zoom = clampZoom(newZoom);
  const before = screenToGrid(view, cellSize, screenX, screenY);
  return {
    zoom,
    panX: screenX - before.x * cellSize * zoom,
    panY: screenY - before.y * cellSize * zoom,
  };
}

export function panBy(view, dx, dy) {
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy };
}
