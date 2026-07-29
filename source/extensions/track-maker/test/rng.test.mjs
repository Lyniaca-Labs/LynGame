import test from "node:test";
import assert from "node:assert/strict";
import { createRng, randRange, randInt, pick } from "../frontend/js/rng.mjs";

test("createRng is deterministic for a given seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test("createRng produces values in [0, 1)", () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("different seeds produce different sequences", () => {
  const a = createRng(1)();
  const b = createRng(2)();
  assert.notEqual(a, b);
});

test("randRange stays within bounds", () => {
  const rng = createRng(7);
  for (let i = 0; i < 500; i++) {
    const v = randRange(rng, 10, 20);
    assert.ok(v >= 10 && v < 20);
  }
});

test("randInt is inclusive of both bounds and only returns integers", () => {
  const rng = createRng(9);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = randInt(rng, 0, 3);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 0 && v <= 3);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test("pick returns an element from the array", () => {
  const rng = createRng(3);
  const arr = ["a", "b", "c"];
  for (let i = 0; i < 50; i++) {
    assert.ok(arr.includes(pick(rng, arr)));
  }
});
