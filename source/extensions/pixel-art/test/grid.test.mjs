import test from "node:test";
import assert from "node:assert/strict";
import { createGrid, indexOf, inBounds, getCell, setCell, cloneGrid } from "../frontend/js/grid.mjs";

test("createGrid returns a w*h array filled with null", () => {
  const g = createGrid(3, 2);
  assert.equal(g.length, 6);
  assert.ok(g.every((c) => c === null));
});

test("indexOf computes row-major index", () => {
  assert.equal(indexOf(4, 0, 0), 0);
  assert.equal(indexOf(4, 1, 2), 9);
  assert.equal(indexOf(4, 3, 0), 3);
});

test("inBounds is true on all edges and false outside", () => {
  assert.ok(inBounds(4, 3, 0, 0));
  assert.ok(inBounds(4, 3, 3, 2));
  assert.ok(!inBounds(4, 3, -1, 0));
  assert.ok(!inBounds(4, 3, 0, -1));
  assert.ok(!inBounds(4, 3, 4, 0));
  assert.ok(!inBounds(4, 3, 0, 3));
});

test("setCell then getCell round-trips and leaves other cells untouched", () => {
  const g = createGrid(3, 3);
  setCell(g, 3, 1, 1, "#ff0000");
  assert.equal(getCell(g, 3, 1, 1), "#ff0000");
  assert.equal(getCell(g, 3, 0, 0), null);
  assert.equal(getCell(g, 3, 2, 2), null);
});

test("cloneGrid returns an equal but independent array", () => {
  const g = createGrid(2, 2);
  setCell(g, 2, 0, 0, "#000000");
  const clone = cloneGrid(g);
  assert.deepEqual(clone, g);
  setCell(clone, 2, 1, 1, "#ffffff");
  assert.equal(getCell(g, 2, 1, 1), null);
});
