// Frame list helpers. A "frame" in memory is { name, canvas } — canvas is
// already cropped/padded to exactly one cell (cellWidth x cellHeight) so
// compositing later is just drawImage(frame.canvas, col*cw, row*ch) with no
// further scaling math.

export function uniqueFrameName(frames, base) {
  const used = new Set(frames.map((f) => f.name));
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// Crops-or-pads `img` into a new cellWidth x cellHeight canvas, centered.
// Oversized images get their edges cropped equally on each side; undersized
// images get transparent padding — both directions fall out of one
// centered drawImage call.
export function cropToCell(img, cellWidth, cellHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth;
  canvas.height = cellHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const dx = Math.floor((cellWidth - img.width) / 2);
  const dy = Math.floor((cellHeight - img.height) / 2);
  ctx.drawImage(img, dx, dy);
  return canvas;
}

// Crops one cellWidth x cellHeight tile out of `img` at a specific offset —
// no centering, unlike cropToCell — used to partition an oversized image
// into a grid of frames instead of squashing it into a single cell.
export function cropTile(img, sx, sy, cellWidth, cellHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth;
  canvas.height = cellHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
  return canvas;
}

export function moveFrame(frames, from, to) {
  if (from === to) return frames;
  const next = frames.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
