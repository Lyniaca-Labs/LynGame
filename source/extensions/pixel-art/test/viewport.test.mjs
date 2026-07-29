import test from "node:test";
import assert from "node:assert/strict";
import { MIN_ZOOM, MAX_ZOOM, clampZoom, screenToGrid, gridToScreen, zoomAt, panBy } from "../frontend/js/viewport.mjs";

const CELL = 20;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("clampZoom clamps to [MIN_ZOOM, MAX_ZOOM] and passes through in-range values", () => {
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(2), 2);
});

test("screenToGrid and gridToScreen are inverses", () => {
  const view = { zoom: 2, panX: 30, panY: -15 };
  const g = screenToGrid(view, CELL, 130, 45);
  const s = gridToScreen(view, CELL, g.x, g.y);
  assert.ok(close(s.x, 130) && close(s.y, 45));
});

test("zoomAt keeps the grid point under the cursor fixed on screen", () => {
  const view = { zoom: 1, panX: 0, panY: 0 };
  const screenX = 123;
  const screenY = 77;
  const before = screenToGrid(view, CELL, screenX, screenY);
  const next = zoomAt(view, CELL, screenX, screenY, 3);
  const after = screenToGrid(next, CELL, screenX, screenY);
  assert.ok(close(before.x, after.x) && close(before.y, after.y));
  assert.equal(next.zoom, 3);
});

test("zoomAt clamps the requested zoom", () => {
  const view = { zoom: 1, panX: 0, panY: 0 };
  const next = zoomAt(view, CELL, 0, 0, 999);
  assert.equal(next.zoom, MAX_ZOOM);
});

test("panBy shifts pan without changing zoom", () => {
  const view = { zoom: 2, panX: 10, panY: 10 };
  const next = panBy(view, 5, -3);
  assert.deepEqual(next, { zoom: 2, panX: 15, panY: 7 });
});
