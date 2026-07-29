// source/extensions/track-maker/test/mix.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mixBuffers } from "../frontend/js/mix.mjs";

test("mixBuffers returns an empty array for no input buffers", () => {
  assert.equal(mixBuffers([]).length, 0);
});

test("mixBuffers sums same-length buffers", () => {
  const a = new Float32Array([0.1, 0.2, 0.3]);
  const b = new Float32Array([0.1, 0.1, 0.1]);
  const out = mixBuffers([a, b]);
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(out[1] - 0.3) < 1e-6);
  assert.ok(Math.abs(out[2] - 0.4) < 1e-6);
});

test("mixBuffers pads shorter buffers with silence and output length matches the longest", () => {
  const a = new Float32Array([0.1, 0.1, 0.1, 0.1]);
  const b = new Float32Array([0.1]);
  const out = mixBuffers([a, b]);
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(out[3] - 0.1) < 1e-6);
});

test("mixBuffers applies per-buffer gains", () => {
  const a = new Float32Array([1]);
  const b = new Float32Array([1]);
  const out = mixBuffers([a, b], [0.5, 0.25]);
  assert.ok(Math.abs(out[0] - 0.75) < 1e-6);
});

test("mixBuffers clamps output to [-1, 1]", () => {
  const a = new Float32Array([1, -1]);
  const b = new Float32Array([1, -1]);
  const out = mixBuffers([a, b]);
  assert.equal(out[0], 1);
  assert.equal(out[1], -1);
});
