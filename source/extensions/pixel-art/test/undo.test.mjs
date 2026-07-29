import test from "node:test";
import assert from "node:assert/strict";
import { createUndoStack, pushSnapshot, undo, redo, resetUndoStack } from "../frontend/js/undo.mjs";

test("undo on an empty stack returns null", () => {
  const stack = createUndoStack();
  assert.equal(undo(stack, ["a"]), null);
});

test("pushSnapshot then undo returns an independent copy of the pushed state", () => {
  const stack = createUndoStack();
  const cells = ["a", "b"];
  pushSnapshot(stack, cells);
  cells[0] = "mutated";
  const restored = undo(stack, cells);
  assert.deepEqual(restored, ["a", "b"]);
  assert.notEqual(restored, cells);
});

test("redo restores the state that was current at undo time", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  const restored = undo(stack, ["v2"]);
  assert.deepEqual(restored, ["v1"]);
  const redone = redo(stack, restored);
  assert.deepEqual(redone, ["v2"]);
});

test("redo on an empty redo stack returns null", () => {
  const stack = createUndoStack();
  assert.equal(redo(stack, ["a"]), null);
});

test("pushSnapshot after an undo clears the redo stack", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  undo(stack, ["v2"]);
  pushSnapshot(stack, ["v3"]);
  assert.equal(redo(stack, ["v3"]), null);
});

test("undo stack evicts the oldest snapshot once maxDepth is exceeded", () => {
  const stack = createUndoStack(2);
  pushSnapshot(stack, ["v1"]);
  pushSnapshot(stack, ["v2"]);
  pushSnapshot(stack, ["v3"]);
  assert.deepEqual(undo(stack, ["v4"]), ["v3"]);
  assert.deepEqual(undo(stack, ["v3"]), ["v2"]);
  assert.equal(undo(stack, ["v2"]), null);
});

test("resetUndoStack empties both stacks", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  undo(stack, ["v2"]);
  resetUndoStack(stack);
  assert.equal(undo(stack, ["v3"]), null);
  assert.equal(redo(stack, ["v3"]), null);
});
