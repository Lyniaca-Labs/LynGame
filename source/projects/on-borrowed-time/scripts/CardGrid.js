// CardGrid
// Shared paginated-grid layout for screens built from stacks of the Card
// prefab — CardDirectoryController's full-catalog showcase and
// ShopController's Upgrade/Remove deck picker both need the same thing: lay
// out a page of cards without ever overflowing the viewport. A fixed
// column/row count overflows off-screen with no way to reach the rest once
// there are enough cards (or the window's small enough) — computeCardGridLayout
// derives how many actually fit the CURRENT viewport instead, so pulled out
// here rather than reimplemented per screen (which is exactly how the
// picker drifted out of sync with the directory's fix in the first place).

import { setCardScaleInstant } from "./CardVisuals.js";

export const CARD_W = 112, CARD_H = 152; // native Card prefab size

export function computeCardGridLayout(engine, { scale, maxColumns, maxRows, topMargin, bottomMargin, sideMargin }) {
  const vp = engine.getViewportSize();
  const colSpacing = CARD_W * scale + 24;
  const rowSpacing = CARD_H * scale + 34;
  const usableWidth = vp.width - sideMargin * 2;
  const usableHeight = vp.height - topMargin - bottomMargin;
  const columns = Math.max(1, Math.min(maxColumns, Math.floor(usableWidth / colSpacing)));
  const rows = Math.max(1, Math.min(maxRows, Math.floor(usableHeight / rowSpacing)));
  return { columns, rows, pageSize: columns * rows, colSpacing, rowSpacing };
}

// Arranges already-spawned `entities` (in page order) into rows sized by
// `layout`, vertically centered within [topMargin, viewportHeight-bottomMargin],
// shrinks each to `scale` (setCardScaleInstant — an instant resting-size
// assignment, not an animated one, same as a fresh page load elsewhere),
// and sets each one's hover-lift baseY explicitly — a hover firing before
// this on the very first frame could otherwise lock in a pre-layout
// position as the permanent base (same reasoning as every other hover screen).
export function layoutCardGridPage(engine, entities, layout, { topMargin, bottomMargin, scale }) {
  const vp = engine.getViewportSize();
  const rows = [];
  entities.forEach((ent, i) => {
    const row = Math.floor(i / layout.columns);
    rows[row] = rows[row] || [];
    rows[row].push(ent);
  });

  const contentCenterY = (topMargin + (vp.height - bottomMargin)) / 2;
  const startY = contentCenterY - (layout.rowSpacing * (rows.length - 1)) / 2;
  rows.forEach((rowEnts, r) => {
    engine.gui.layoutRow(rowEnts, {
      centerX: vp.width / 2, centerY: startY + r * layout.rowSpacing,
      spacing: layout.colSpacing, direction: "horizontal", baseZIndex: 20,
    });
  });

  for (const ent of entities) {
    setCardScaleInstant(ent, scale);
    ent.state.baseY = ent.getComponent("Transform").y;
  }
}

// onClickFn must be a real function (entity, engine) => void, not a code
// string — a string assigned directly to an already-constructed
// Interactable's onClick is never compiled (that only happens for onClick
// passed through the constructor, see Interactable.js's compileCode) and
// throws "onClick is not a function" the moment it's clicked. null is the
// correct "disabled" value instead of "".
export function setPagerButton(engine, id, enabled, onClickFn) {
  const ent = engine.getEntity(id);
  const it = ent && ent.getComponent("Interactable");
  const op = ent && ent.getComponent("Opacity");
  if (it) { it.onClick = enabled ? onClickFn : null; it.cursor = enabled ? "pointer" : "default"; }
  if (op) op.value = enabled ? 1 : 0.35;
}

export function CardGrid() {}
