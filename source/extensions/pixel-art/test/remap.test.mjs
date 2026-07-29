import test from "node:test";
import assert from "node:assert/strict";
import { nearestColorIndex, remapToPalette } from "../frontend/js/remap.mjs";

test("nearestColorIndex picks the closest palette entry", () => {
  const palette = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 255, g: 0, b: 0 }];
  assert.equal(nearestColorIndex({ r: 240, g: 10, b: 5 }, palette), 2);
  assert.equal(nearestColorIndex({ r: 10, g: 10, b: 10 }, palette), 0);
  assert.equal(nearestColorIndex({ r: 250, g: 250, b: 250 }, palette), 1);
});

test("remapToPalette maps opaque cells to their nearest palette color", () => {
  const cells = ["#ff0505", "#050505"];
  const result = remapToPalette(cells, ["#000000", "#ff0000"]);
  assert.deepEqual(result, ["#ff0000", "#000000"]);
});

test("remapToPalette leaves transparent cells as null", () => {
  const cells = ["#ff0000", null, "#0000ff"];
  const result = remapToPalette(cells, ["#000000", "#ffffff"]);
  assert.equal(result[1], null);
});

test("remapToPalette preserves each cell's original alpha", () => {
  const cells = ["rgba(250,5,5,0.4)"];
  const result = remapToPalette(cells, ["#000000", "#ff0000"]);
  assert.equal(result[0], "rgba(255,0,0,0.400)");
});

test("remapToPalette with an empty palette returns an unchanged copy", () => {
  const cells = ["#ff0000", null];
  const result = remapToPalette(cells, []);
  assert.deepEqual(result, cells);
  assert.notEqual(result, cells);
});

test("remapToPalette does not mutate the input array", () => {
  const cells = ["#ff0505"];
  const original = cells.slice();
  remapToPalette(cells, ["#000000", "#ff0000"]);
  assert.deepEqual(cells, original);
});
