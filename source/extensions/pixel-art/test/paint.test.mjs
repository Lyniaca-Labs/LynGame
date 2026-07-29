import test from "node:test";
import assert from "node:assert/strict";
import { brushCells } from "../frontend/js/paint.mjs";

test("size 1 returns exactly the cursor cell", () => {
  assert.deepEqual(brushCells(10, 10, 5, 5, 1), [{ x: 5, y: 5 }]);
});

test("size 3 fully inside the grid returns the full 3x3 block", () => {
  const cells = brushCells(10, 10, 2, 2, 3);
  const expected = [];
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) expected.push({ x: 2 + dx, y: 2 + dy });
  }
  assert.deepEqual(cells, expected);
});

test("brush clips at the bottom-right edge instead of wrapping or erroring", () => {
  const cells = brushCells(10, 10, 9, 9, 3);
  assert.deepEqual(cells, [{ x: 9, y: 9 }]);
});

test("brush clips partially at a right edge", () => {
  const cells = brushCells(10, 10, 8, 5, 3);
  assert.deepEqual(cells, [
    { x: 8, y: 5 }, { x: 9, y: 5 },
    { x: 8, y: 6 }, { x: 9, y: 6 },
    { x: 8, y: 7 }, { x: 9, y: 7 },
  ]);
});

test("brush larger than the grid returns only in-bounds cells, no duplicates", () => {
  const cells = brushCells(2, 2, 0, 0, 8);
  assert.equal(cells.length, 4);
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
  assert.equal(keys.size, 4);
});
