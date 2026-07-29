import { cloneGrid } from "./grid.mjs";

export function createUndoStack(maxDepth = 50) {
  return { undoStack: [], redoStack: [], maxDepth };
}

export function pushSnapshot(stack, cells) {
  stack.undoStack.push(cloneGrid(cells));
  if (stack.undoStack.length > stack.maxDepth) stack.undoStack.shift();
  stack.redoStack.length = 0;
}

export function undo(stack, currentCells) {
  if (stack.undoStack.length === 0) return null;
  const prev = stack.undoStack.pop();
  stack.redoStack.push(cloneGrid(currentCells));
  return prev;
}

export function redo(stack, currentCells) {
  if (stack.redoStack.length === 0) return null;
  const next = stack.redoStack.pop();
  stack.undoStack.push(cloneGrid(currentCells));
  return next;
}

export function resetUndoStack(stack) {
  stack.undoStack.length = 0;
  stack.redoStack.length = 0;
}
