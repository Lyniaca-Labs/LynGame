// Generic undo/redo stack — same shape as pixel-art's undo.mjs, but doesn't
// clone internally (a spritesheet snapshot needs canvas-aware cloning, which
// is sheet-specific — see index.html's snapshotState/applyState). Callers
// are expected to always pass an already-cloned, independent snapshot.

export function createUndoStack(maxDepth = 50) {
  return { undoStack: [], redoStack: [], maxDepth };
}

export function pushSnapshot(stack, snapshot) {
  stack.undoStack.push(snapshot);
  if (stack.undoStack.length > stack.maxDepth) stack.undoStack.shift();
  stack.redoStack.length = 0;
}

export function undo(stack, currentSnapshot) {
  if (stack.undoStack.length === 0) return null;
  const prev = stack.undoStack.pop();
  stack.redoStack.push(currentSnapshot);
  return prev;
}

export function redo(stack, currentSnapshot) {
  if (stack.redoStack.length === 0) return null;
  const next = stack.redoStack.pop();
  stack.undoStack.push(currentSnapshot);
  return next;
}

export function resetUndoStack(stack) {
  stack.undoStack.length = 0;
  stack.redoStack.length = 0;
}
