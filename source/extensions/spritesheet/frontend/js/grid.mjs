// Grid layout math + compositing. Frame `index` = row-major position in the
// `frames` array — never stored independently, always derived from array
// order, so reordering the array IS reordering the grid.

export function rowsFor(count, columns) {
  return Math.max(1, Math.ceil(count / columns));
}

export function frameIndexToCell(index, columns) {
  return { col: index % columns, row: Math.floor(index / columns) };
}

// One PNG sized to fit every frame in its grid position.
export function compositeSheet(frames, cellWidth, cellHeight, columns) {
  const rows = rowsFor(frames.length, columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;
  const ctx = canvas.getContext("2d");
  frames.forEach((frame, index) => {
    const { col, row } = frameIndexToCell(index, columns);
    ctx.drawImage(frame.canvas, col * cellWidth, row * cellHeight);
  });
  return canvas;
}

// The `.spritesheet.json` sidecar shape (see docs/superpowers/specs/2026-07-30-spritesheets-design.md).
export function buildMeta(frames, clips, cellWidth, cellHeight, columns) {
  return {
    cellWidth,
    cellHeight,
    columns,
    frames: frames.map((f, index) => ({ index, name: f.name })),
    clips,
  };
}
