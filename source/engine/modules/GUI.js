// Plain layout helpers, not components — call these from a script whenever
// the set of entities they arrange changes (hand size changed, a card was
// drawn/discarded, etc). They just set Transform x/y/rotation/zIndex on the
// entities you pass in; nothing here is ticked automatically.

/**
 * Arranges `entities` in a fanned arc, like a hand of cards: evenly spread
 * left-to-right, each card rotated slightly toward the edges and lifted
 * along a shallow arc so it reads as a hand rather than a flat row. Draw
 * order (zIndex) follows array order so later cards overlap earlier ones,
 * left-to-right — pass a reordered array if you want a different card on top.
 *
 * @param {Entity[]} entities - entities to arrange, each needs a Transform.
 * @param {object} [options]
 * @param {number} [options.centerX=0] - world/screen x of the hand's midpoint.
 * @param {number} [options.centerY=0] - world/screen y of the hand's midpoint.
 * @param {number} [options.spacing=60] - horizontal distance between card centers.
 * @param {number} [options.maxAngle=20] - degrees the outermost cards rotate toward.
 * @param {number} [options.arcHeight=18] - how far outer cards lift/drop along the arc.
 * @param {number} [options.baseZIndex=0] - zIndex of the first (leftmost) card.
 */
export function layoutHand(entities, options = {}) {
  const {
    centerX = 0,
    centerY = 0,
    spacing = 60,
    maxAngle = 20,
    arcHeight = 18,
    baseZIndex = 0,
  } = options;

  const count = entities.length;
  if (!count) return;

  const mid = (count - 1) / 2;

  entities.forEach((entity, i) => {
    const transform = entity?.getComponent?.("Transform");
    if (!transform) return;

    // -1..1 across the hand, 0 at the middle card
    const t = mid === 0 ? 0 : (i - mid) / mid;

    transform.x = centerX + (i - mid) * spacing;
    transform.y = centerY + Math.abs(t) * arcHeight;
    transform.rotation = t * maxAngle;
    transform.zIndex = baseZIndex + i;
  });
}

/**
 * Arranges `entities` in a simple evenly-spaced row/column — deck/discard
 * pile stacks, button bars, score readouts, etc. No rotation or arc.
 *
 * @param {Entity[]} entities
 * @param {object} [options]
 * @param {number} [options.centerX=0]
 * @param {number} [options.centerY=0]
 * @param {number} [options.spacing=60]
 * @param {"horizontal"|"vertical"} [options.direction="horizontal"]
 * @param {number} [options.baseZIndex=0]
 */
export function layoutRow(entities, options = {}) {
  const {
    centerX = 0,
    centerY = 0,
    spacing = 60,
    direction = "horizontal",
    baseZIndex = 0,
  } = options;

  const count = entities.length;
  if (!count) return;

  const mid = (count - 1) / 2;

  entities.forEach((entity, i) => {
    const transform = entity?.getComponent?.("Transform");
    if (!transform) return;

    const offset = (i - mid) * spacing;
    transform.x = direction === "horizontal" ? centerX + offset : centerX;
    transform.y = direction === "vertical" ? centerY + offset : centerY;
    transform.zIndex = baseZIndex + i;
  });
}

/**
 * Stacks `entities` directly on top of each other with a small pixel offset
 * per card so the pile still reads as a stack (deck/discard piles) — each
 * successive entity draws above the last.
 *
 * @param {Entity[]} entities
 * @param {object} [options]
 * @param {number} [options.x=0]
 * @param {number} [options.y=0]
 * @param {number} [options.offsetPerCard=1.5] - px shift applied per card, both axes.
 * @param {number} [options.baseZIndex=0]
 */
export function layoutStack(entities, options = {}) {
  const { x = 0, y = 0, offsetPerCard = 1.5, baseZIndex = 0 } = options;

  entities.forEach((entity, i) => {
    const transform = entity?.getComponent?.("Transform");
    if (!transform) return;

    transform.x = x + i * offsetPerCard;
    transform.y = y - i * offsetPerCard;
    transform.rotation = 0;
    transform.zIndex = baseZIndex + i;
  });
}
