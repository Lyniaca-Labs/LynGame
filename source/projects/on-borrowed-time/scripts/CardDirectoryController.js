// CardDirectoryController
// Runs the standalone "carddirectory" scene — a browse-only showcase of
// every card in CARD_DEFS, reachable from the title screen (MenuCardDirectory.js)
// and from the battle pause menu (BattleController.js's openFromPause).
// engine.state.cardDirectoryReturn records which one sent the player here,
// so the Back button (DirectoryBack.js -> goBack) returns to the right place.
//
// Paginated rather than one big grid — a fixed column/row count overflowed
// off-screen with no way to see the rest (24 cards is too many for one
// screen at a readable size). computeLayout() instead derives how many
// columns/rows actually fit the CURRENT viewport, so this can never overflow
// regardless of window size; Prev/Next (DirectoryPrevPage.js/DirectoryNextPage.js)
// step through the resulting pages.

import { CARD_DEFS, formatDescription, borderFrameForTier, cardIconOverride } from "./CardDatabase.js";
import { clickThenLoadScene, playSound } from "./SoundEffects.js";
import { computeCardGridLayout, layoutCardGridPage, setPagerButton } from "./CardGrid.js";

const GALLERY_CARD_SCALE = 0.85; // mild shrink, not the old 0.68 — legibility over cramming more per page
const TOP_MARGIN = 90; // room for the title/back button
const BOTTOM_MARGIN = 110; // room for the prev/page-label/next row
const SIDE_MARGIN = 60;
const MAX_COLUMNS = 5;
const MAX_ROWS = 3;

const CARD_IDS = Object.keys(CARD_DEFS);

function computeLayout(engine) {
  return computeCardGridLayout(engine, {
    scale: GALLERY_CARD_SCALE, maxColumns: MAX_COLUMNS, maxRows: MAX_ROWS,
    topMargin: TOP_MARGIN, bottomMargin: BOTTOM_MARGIN, sideMargin: SIDE_MARGIN,
  });
}

function clearGalleryEntities(engine) {
  let i = 0;
  while (engine.getEntity(`galleryCard_${i}`)) {
    engine.removeEntity(`galleryCard_${i}`);
    i++;
  }
}

function spawnGalleryPage(engine, page) {
  clearGalleryEntities(engine);
  const layout = computeLayout(engine);
  const pageCount = Math.max(1, Math.ceil(CARD_IDS.length / layout.pageSize));
  const clampedPage = Math.max(0, Math.min(page, pageCount - 1));
  engine.state.cardDirectoryPage = clampedPage;

  const vp = engine.getViewportSize();
  const start = clampedPage * layout.pageSize;
  const pageIds = CARD_IDS.slice(start, start + layout.pageSize);
  const entities = [];

  pageIds.forEach((defId, i) => {
    const def = CARD_DEFS[defId];
    const id = `galleryCard_${i}`;
    const ent = engine.prefabs.instantiate("Card", {
      Transform: { x: vp.width / 2, y: vp.height / 2, zIndex: 20 + i },
      ShapeRenderer: { color: def.color },
      SpriteRenderer: { frame: borderFrameForTier(def.tier) },
      Interactable: {
        onHoverEnter: "engine.callScript('ShopOfferHoverEnter', entity, engine);",
        onHoverExit: "engine.callScript('ShopOfferHoverExit', entity, engine);",
      },
      children: {
        icon: cardIconOverride(def.id, def.icon),
        name: { TextRenderer: { text: def.name } },
        desc: { TextRenderer: { text: formatDescription(def, 1) } },
      },
    }, id);
    if (ent) entities.push(ent);
  });

  layoutCardGridPage(engine, entities, layout, { topMargin: TOP_MARGIN, bottomMargin: BOTTOM_MARGIN, scale: GALLERY_CARD_SCALE });

  const labelEnt = engine.getEntity("directoryPageLabel");
  const labelTr = labelEnt && labelEnt.getComponent("TextRenderer");
  if (labelTr) labelTr.text = `Page ${clampedPage + 1} / ${pageCount}`;

  setPagerButton(engine, "directoryPrevBtn", clampedPage > 0, prevPage);
  setPagerButton(engine, "directoryNextBtn", clampedPage < pageCount - 1, nextPage);
}

export function CardDirectoryController(entity, engine, dt) {
  if (!engine.getEntity("galleryCard_0")) {
    spawnGalleryPage(engine, engine.state.cardDirectoryPage || 0);
  }
}

export function nextPage(entity, engine) {
  playSound(engine, "click");
  spawnGalleryPage(engine, (engine.state.cardDirectoryPage || 0) + 1);
}

export function prevPage(entity, engine) {
  playSound(engine, "click");
  spawnGalleryPage(engine, (engine.state.cardDirectoryPage || 0) - 1);
}

export function goBack(entity, engine) {
  const target = engine.state.cardDirectoryReturn || "menu";
  engine.state.cardDirectoryReturn = null;
  engine.state.cardDirectoryPage = 0;
  clickThenLoadScene(engine, target);
}
