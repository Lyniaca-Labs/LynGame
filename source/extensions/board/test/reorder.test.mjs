import test from "node:test";
import assert from "node:assert/strict";
import { moveItem } from "../frontend/js/reorder.mjs";

test("moveItem moves an item forward in the array", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
});

test("moveItem moves an item backward in the array", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
});

test("moveItem to the same index is a no-op", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("moveItem to index 0 moves the item to the start", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
});

test("moveItem to the last index moves the item to the end", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
});

test("moveItem does not mutate the input array", () => {
  const input = ["a", "b", "c"];
  moveItem(input, 0, 2);
  assert.deepEqual(input, ["a", "b", "c"]);
});
