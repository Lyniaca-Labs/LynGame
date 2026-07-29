import test from "node:test";
import assert from "node:assert/strict";
import { extractColors, quantizeColors } from "../frontend/js/quantize.mjs";
import { hexToRgb, colorDistance } from "../frontend/js/colorMath.mjs";

function fakeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test("extractColors skips transparent cells and parses hex/rgba", () => {
  const cells = ["#ff0000", null, "rgba(0,0,255,0.5)", null];
  assert.deepEqual(extractColors(cells), [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 0, b: 255 },
  ]);
});

test("quantizeColors returns an empty array for no input colors", () => {
  assert.deepEqual(quantizeColors([], 4), []);
});

test("quantizeColors returns unique colors as-is when there are <= k of them", () => {
  const colors = [{ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }, { r: 40, g: 50, b: 60 }];
  const result = quantizeColors(colors, 5, fakeRng([0.1, 0.9]));
  assert.equal(result.length, 2);
  assert.deepEqual(new Set(result), new Set(["#0a141e", "#28323c"]));
});

test("quantizeColors reduces down to exactly k colors when there are more unique colors than k", () => {
  const colors = [];
  for (let i = 0; i < 20; i++) colors.push({ r: i * 10, g: 0, b: 0 });
  const result = quantizeColors(colors, 3, fakeRng([0.1, 0.4, 0.7, 0.2, 0.5, 0.9]));
  assert.equal(result.length, 3);
});

test("quantizeColors is deterministic for the same rng sequence", () => {
  const colors = [];
  for (let i = 0; i < 15; i++) colors.push({ r: i * 15, g: i * 3, b: 255 - i * 10 });
  const seq = () => fakeRng([0.2, 0.6, 0.4, 0.8, 0.1]);
  assert.deepEqual(quantizeColors(colors, 3, seq()), quantizeColors(colors, 3, seq()));
});

test("quantizeColors separates two distinct color clusters correctly", () => {
  const colors = [];
  // 10 samples jittered around red, 10 jittered around blue.
  for (let i = 0; i < 10; i++) colors.push({ r: 250 + (i % 3), g: i % 2, b: i % 2 });
  for (let i = 0; i < 10; i++) colors.push({ r: i % 2, g: i % 2, b: 250 + (i % 3) });

  const result = quantizeColors(colors, 2, fakeRng([0.05, 0.95, 0.3, 0.7]));
  assert.equal(result.length, 2);

  const centroids = result.map(hexToRgb);
  const red = { r: 255, g: 0, b: 0 };
  const blue = { r: 0, g: 0, b: 255 };
  const nearestToRed = colorDistance(centroids[0], red) < colorDistance(centroids[0], blue) ? centroids[0] : centroids[1];
  const nearestToBlue = nearestToRed === centroids[0] ? centroids[1] : centroids[0];

  assert.ok(colorDistance(nearestToRed, red) < 20, `expected near-red centroid, got ${JSON.stringify(nearestToRed)}`);
  assert.ok(colorDistance(nearestToBlue, blue) < 20, `expected near-blue centroid, got ${JSON.stringify(nearestToBlue)}`);
});
