// CardDatabase
// Static data only (no per-frame logic) — the required matching export
// below is a no-op so this file can still live in scripts/ and be imported
// by name (see PROJECT_STRUCTURE.md#scripts-folder) while its real payload
// (CARD_DEFS etc) is consumed via plain named imports from other scripts.
//
// Most "damage" cards hit the opponent's CURRENT time directly (simple,
// doesn't compound). The exception is Time Steal — a rare, pricier card
// that instead shaves a small amount off their MAX time. resolveEffects()
// (CardEffects.js) clamps current time down to the new max if it was above
// it, and every future regen/heal tick is now capped lower too — a much
// stronger effect per second than direct damage, which is exactly why it's
// gated to one rare card with a small amount instead of being the norm.
//
// `category` drives the per-play juice in BattleController.js (applyCardFx)
// — attack cards screenshake (scaled by realized damage), everything else
// gets a quick color-coded vignette pulse (defense=blue, heal=green,
// utility=gray). It's a presentation label, not a gameplay one, so mixed
// cards (e.g. Blood Pact, Drain Strike) are filed under whichever effect is
// dominant.

// Shop prices across the board were running ~25% higher than intended
// relative to round income (endRound's reward formula, BattleController.js)
// — every price below is that same ~25% cut applied uniformly, not a
// per-card judgment call, so relative tiering is unchanged.
export const CARD_DEFS = {
  strike: {
    id: "strike", name: "Strike", tier: 1, price: 8, category: "attack",
    color: "#9b4f4f", icon: "#ef4444",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -2 }],
  },
  // Was a flat 2x Strike (double price, double damage, zero downside) — the
  // best damage-per-price ratio of any attack card with no drawback at all,
  // beating every risk/reward attack (bloodPact, overclock, pierceStrike)
  // that trades a real cost for a similar or better ratio. Cut to -3.
  heavyStrike: {
    id: "heavyStrike", name: "Heavy Strike", tier: 2, price: 15, category: "attack",
    color: "#9b4f4f", icon: "#b91c1c",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -3 }],
  },
  guard: {
    id: "guard", name: "Guard", tier: 1, price: 8, category: "defense",
    color: "#506582", icon: "#3b82f6",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 3 }],
  },
  reinforce: {
    id: "reinforce", name: "Reinforce", tier: 3, price: 18, category: "defense",
    color: "#506582", icon: "#2563eb",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 6 }],
  },
  fortify: {
    id: "fortify", name: "Fortify", tier: 2, price: 14, category: "defense",
    color: "#506582", icon: "#60a5fa",
    descTemplate: "Increase your max time by {amt}s.",
    effects: [{ type: "maxTime", target: "self", amount: 1 }],
  },
  mend: {
    id: "mend", name: "Mend", tier: 1, price: 8, category: "heal",
    color: "#48795b", icon: "#22c55e",
    descTemplate: "Restore {amt}s.",
    effects: [{ type: "currentTime", target: "self", amount: 2 }],
  },
  secondWind: {
    id: "secondWind", name: "Second Wind", tier: 2, price: 14, category: "heal",
    color: "#48795b", icon: "#4ade80",
    descTemplate: "Increase your regen by {amt}s.",
    effects: [{ type: "regen", target: "self", amount: 0.25 }],
  },
  exhaust: {
    id: "exhaust", name: "Exhaust", tier: 2, price: 14, category: "utility",
    color: "#636b77", icon: "#9ca3af",
    descTemplate: "Reduce opponent's regen by {amt}s.",
    effects: [{ type: "regen", target: "opponent", amount: -0.25 }],
  },
  focus: {
    id: "focus", name: "Focus", tier: 2, price: 12, category: "utility",
    color: "#665d81", icon: "#a78bfa",
    descTemplate: "Slow your own clock for the rest of the fight.",
    effects: [{ type: "drainRate", target: "self", amount: -0.25 }],
  },
  // Hand-size sibling is `purge` (below) — Haste is the "safe" +1 card,
  // no downside, capped by MAX_HAND_SIZE (BattleController.js) same as
  // any other hand-size source.
  haste: {
    id: "haste", name: "Haste", tier: 2, price: 14, category: "utility",
    color: "#7f6558", icon: "#f59e0b",
    descTemplate: "Draw {amt} extra card(s) next hand.",
    effects: [{ type: "handSize", target: "self", amount: 1 }],
  },
  drainStrike: {
    id: "drainStrike", name: "Drain Strike", tier: 2, price: 15, category: "attack",
    color: "#724c6c", icon: "#e879f9",
    descTemplate: "Deal {amt} damage and heal {amt2}.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -1 },
      { type: "currentTime", target: "self", amount: 1 },
    ],
  },
  // The one rare max-time card — see the header comment for why it's kept
  // small (0.5-1.5s base) instead of scaled up like the direct-damage cards.
  timeSteal: {
    id: "timeSteal", name: "Time Steal", tier: 3, price: 17, category: "attack",
    color: "#724c6c", icon: "#d946ef",
    descTemplate: "Reduce opponent's max time by {amt}s.",
    effects: [{ type: "maxTime", target: "opponent", amount: -0.5 }],
  },
  // The one card using "trueDamage" (CardEffects.js) instead of
  // "currentTime" — it skips shield absorption entirely, at the cost of
  // chip damage to yourself. Kept to a modest amount since ignoring shield
  // outright is strong even before factoring in the self-damage.
  pierceStrike: {
    id: "pierceStrike", name: "Piercing Strike", tier: 2, price: 14, category: "attack",
    color: "#9b4f4f", icon: "#fca5a5",
    descTemplate: "Deal {amt} damage that ignores shield, but take {amt2} damage yourself.",
    effects: [
      { type: "trueDamage", target: "opponent", amount: -3 },
      { type: "currentTime", target: "self", amount: -1 },
    ],
  },
  // Shield now decays by half each turn-end (resolveTurnEnd in
  // BattleController.js) — these two are the only levers on that rate.
  anchor: {
    id: "anchor", name: "Anchor", tier: 2, price: 14, category: "defense",
    color: "#506582", icon: "#93c5fd",
    // shieldRetain amounts are percentage-points (CardEffects.js divides by
    // 100 when applying) purely so formatDescription's raw-number {amt}
    // substitution reads naturally here ("20") instead of "0.2".
    descTemplate: "Your shield decays {amt}% slower for the rest of the fight.",
    effects: [{ type: "shieldRetain", target: "self", amount: 20 }],
  },
  corrode: {
    id: "corrode", name: "Corrode", tier: 2, price: 14, category: "utility",
    color: "#636b77", icon: "#f97316",
    descTemplate: "Opponent's shield decays {amt}% faster for the rest of the fight.",
    effects: [{ type: "shieldRetain", target: "opponent", amount: -20 }],
  },
  // Ticking damage — see the "poison" case in CardEffects.js. Stacks if
  // played more than once (capped at POISON_MAX_PER_TURN); ticks for both
  // sides every turn-end regardless of whose turn it was, same cadence as
  // shield decay.
  borrowedTime: {
    id: "borrowedTime", name: "Borrowed Time", tier: 2, price: 15, category: "utility",
    color: "#724c6c", icon: "#c026d3",
    descTemplate: "Opponent's time bleeds {amt}s every turn for the rest of the fight.",
    effects: [{ type: "poison", target: "opponent", amount: 0.5 }],
  },
  // Dampens (not negates) pace's speed-up on this side's own drain — see
  // BattleController.js's phase drain code, which shrinks how much of
  // intensityMultiplier(b)'s ramp applies by this percentage. Permanent,
  // stacks with itself (additively, capped at 100%), priced/tiered accordingly.
  timeless: {
    id: "timeless", name: "Timeless", tier: 3, price: 17, category: "utility",
    color: "#505866", icon: "#e2e8f0",
    descTemplate: "Your clock resists {amt}% of pace's speed-up for the rest of the fight.",
    effects: [{ type: "timeless", target: "self", amount: 50 }],
  },
  // "pace" is battle-level, not per-side — resolveEffects() no-ops on it;
  // playCard (BattleController.js) reads this effect straight off the def
  // and rolls back b.roundElapsed directly, which is what pace is derived
  // from (intensityMultiplier). Affects both sides equally since pace is
  // shared, so it reads as "reset some of the built-up intensity."
  timeOut: {
    id: "timeOut", name: "Time Out", tier: 2, price: 13, category: "utility",
    color: "#497585", icon: "#67e8f9",
    descTemplate: "Roll back {amt}s of the fight's built-up pace.",
    effects: [{ type: "pace", target: "self", amount: -8 }],
  },
  // Risk/reward archetype — all give a bigger payoff than their "safe"
  // equivalent in exchange for a permanent-for-the-fight cost. Upgrading
  // scales both numbers together so the risk:reward ratio stays constant
  // instead of the downside becoming trivial at high card level.
  overclock: {
    id: "overclock", name: "Overclock", tier: 3, price: 20, category: "attack",
    color: "#995b46", icon: "#f97316",
    descTemplate: "Deal {amt} damage, but your own clock speeds up by {amt2} for the rest of the fight.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -6 },
      { type: "drainRate", target: "self", amount: 0.3 },
    ],
  },
  bloodPact: {
    id: "bloodPact", name: "Blood Pact", tier: 2, price: 16, category: "attack",
    color: "#995b46", icon: "#ea580c",
    descTemplate: "Deal {amt} damage, but take {amt2} damage yourself.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -6 },
      { type: "currentTime", target: "self", amount: -2 },
    ],
  },
  allIn: {
    id: "allIn", name: "All-In", tier: 3, price: 19, category: "defense",
    color: "#995b46", icon: "#fb923c",
    descTemplate: "Gain {amt}s shield, but reduce your regen by {amt2}s for the rest of the fight.",
    effects: [
      { type: "shield", target: "self", amount: 9 },
      { type: "regen", target: "self", amount: -1 },
    ],
  },
  // Hand-size sibling of Haste — instead of a second "+cards" card (which
  // just made Haste redundant), this is the opposite trade: give up a card
  // slot next hand in exchange for cleansing your own poison stacks (the
  // "remove effects like poison" ask). The handSize hit is flagged
  // noLevelScale (CardEffects.js) so upgrading this card can't make the
  // hand-size cost worse — cleanse has no natural magnitude to scale
  // against, so there's nothing to keep the downside proportional to.
  purge: {
    id: "purge", name: "Purge", tier: 2, price: 14, category: "utility",
    color: "#636b77", icon: "#9ca3af",
    descTemplate: "Draw {amt} fewer card next hand, but cleanse your poison stacks.",
    effects: [
      { type: "handSize", target: "self", amount: -1, noLevelScale: true },
      { type: "cleanse", target: "self", amount: 1 },
    ],
  },
  // Fortify's risk/reward sibling — hits Fortify's original pre-nerf power
  // (+2 max time, before Fortify itself got knocked down to +1) in exchange
  // for the regen downside, same trade shape as All-In does for Guard.
  overreach: {
    id: "overreach", name: "Overreach", tier: 3, price: 18, category: "defense",
    color: "#995b46", icon: "#fbbf24",
    descTemplate: "Increase your max time by {amt}s, but reduce your regen by {amt2}s for the rest of the fight.",
    effects: [
      { type: "maxTime", target: "self", amount: 2 },
      { type: "regen", target: "self", amount: -1 },
    ],
  },
  // Decaying stacks — see the "reflect" case in CardEffects.js for the gain,
  // and its "currentTime" case for the bounce-back-at-attacker math (5% of
  // realized damage per stack, capped at 60%). Stacks fall off over time
  // (resolveTurnEnd in BattleController.js), so it rewards playing it
  // shortly before you expect to get hit rather than banking it early.
  reflect: {
    id: "reflect", name: "Reflect", tier: 2, price: 14, category: "defense",
    color: "#506582", icon: "#38bdf8",
    descTemplate: "Gain {amt} decaying Reflect stacks — while active, each stack bounces some incoming damage back at your attacker.",
    effects: [{ type: "reflect", target: "self", amount: 3 }],
  },
};

export const STARTER_DECK = [
  "strike", "strike",
  "mend",
  "haste",
  "guard",
];

export const SHOP_POOL = Object.keys(CARD_DEFS);

export const AI_POOL = ["strike", "guard", "mend", "heavyStrike", "drainStrike", "timeSteal", "exhaust", "reinforce", "overclock", "pierceStrike", "anchor", "corrode", "borrowedTime", "timeless", "timeOut", "reflect"];

// Single knob for how much stronger each card level makes its effects — was
// duplicated as a hardcoded `1 + 0.5 * (level - 1)` in CardDatabase.js,
// CardEffects.js, and twice in BattleController.js. Everything now goes
// through levelScale() so this is the only place to tune it.
export const LEVEL_POWER_SCALE = 0.25;

export function levelScale(level) {
  return 1 + LEVEL_POWER_SCALE * (level - 1);
}

// Highest level an upgrade (shop "Upgrade" offer, Rest & Recover, Quick
// Study, Second Chance) can push a card's `level` field to — was hardcoded
// as `level < 3` in both PathChoiceController.js and ShopController.js.
export const MAX_CARD_LEVEL = 10;

// Level icon (assets/levels.png + levels.spritesheet.json) — a numbered
// badge sprite per level, shown by Card.json's "levelIcon" child in place of
// the plain "Lv{level}" text badge. Sheet has frames levels_0..levels_9 for
// levels 1..10 (MAX_CARD_LEVEL), via the "lvl1".."lvl10" clips.
export function levelIconFrame(level) {
  return `levels_${Math.min(Math.max(level, 1), MAX_CARD_LEVEL) - 1}`;
}

// Card art (assets/cards.png + cards.spritesheet.json) — root SpriteRenderer
// frame varies by tier so higher-tier cards read as visibly fancier at a
// glance, layered over each card's own `color` fill (the primary category
// cue). Card.json used to also stack an opaque "cardbg" background sprite
// (cardArt child) on top of that fill — fully hid every card's category
// color behind a flat white card-back, in the shop and everywhere else the
// Card prefab is used. Removed entirely rather than just faded, per
// feedback that the colored fill should be what's actually visible.
const BORDER_FRAME_BY_TIER = {
  1: "cardBackgrounds_0", // "border1" — plain
  2: "cardBackgrounds_5", // "border6" — solid accent
  3: "cardBackgrounds_3", // "border4" — ornate
};

export function borderFrameForTier(tier) {
  return BORDER_FRAME_BY_TIER[tier] || BORDER_FRAME_BY_TIER[1];
}

// Card icon sprites (assets/card_icons.png + card_icons.spritesheet.json) —
// each frame is already a small pixel-art icon on its own colored circular
// backdrop, so Card.json's "icon" child shows the sprite (and hides the
// plain ShapeRenderer circle behind it) when a frame exists for that card;
// any card without one yet falls back to the existing colored circle
// instead of rendering blank.
const ICON_FRAME_BY_ID = {
  strike: "strike", heavyStrike: "heavy_strike", drainStrike: "drain_strike",
  timeSteal: "time_steal", pierceStrike: "piercing_strike", overclock: "overclock",
  bloodPact: "blood_pact", secondWind: "second_wind", guard: "guard",
  reinforce: "reinforce", fortify: "fortify", anchor: "anchor", allIn: "all_in",
  reflect: "reflect", exhaust: "exhaust", focus: "focus", haste: "haste",
  corrode: "corrode", borrowedTime: "borrowed_time", timeless: "timeless",
  timeOut: "timeout", purge: "remove", mend: "mend",
  overreach: "overreach",
};

export function iconFrameForCard(defId) {
  return ICON_FRAME_BY_ID[defId] || null;
}

// Ready-to-spread override for the Card prefab's "icon" child, given an
// already-resolved frame name (or null/undefined) — sprite (and hidden
// circle) when one exists, otherwise the plain colored circle
// (`colorFallback`) exactly as before. Split out from cardIconOverride so
// ShopController's synthetic Upgrade/Remove offers (which have their own
// "upgrade"/"remove" frames but no real card defId to look one up from) can
// hand a frame straight in instead of needing a fake entry in CARD_DEFS.
export function cardIconOverrideByFrame(frame, colorFallback) {
  if (frame) {
    return {
      ShapeRenderer: { width: 0, height: 0 },
      SpriteRenderer: { sprite: "card_icons", frame },
    };
  }
  return { ShapeRenderer: { color: colorFallback } };
}

// Same, but resolves the frame from a real card's defId first. `defId` may
// be undefined — iconFrameForCard(undefined) safely resolves to null, so
// that always falls back to the colored circle as intended.
export function cardIconOverride(defId, colorFallback) {
  return cardIconOverrideByFrame(iconFrameForCard(defId), colorFallback);
}

export function formatDescription(def, level) {
  const scale = levelScale(level);
  const nums = def.effects.map((e) => Math.round(Math.abs(e.amount) * (e.noLevelScale ? 1 : scale) * 10) / 10);
  return def.descTemplate.replace("{amt}", nums[0]).replace("{amt2}", nums[1]);
}

// Build-identity legibility (shop/path-choice screens) — pure presentation
// signal, not a gameplay system. Classifies each card's effects into broad
// synergy buckets (derived from effect `type`, not a per-card hardcoded
// list, so it can't drift out of sync as cards change) so a run's leaning
// becomes visible at a glance instead of requiring the player to mentally
// tally their own deck. Counted per CARD in the deck, once each even if a
// card has multiple effects in the same bucket — level isn't a factor here,
// it changes magnitude, not identity.
const ARCHETYPE_BY_EFFECT = {
  poison: "Poison", reflect: "Reflect", shield: "Shield", shieldRetain: "Shield",
  regen: "Regen", timeless: "Tempo", drainRate: "Tempo", pace: "Tempo",
  handSize: "Draw", maxTime: "Endurance",
};

// Only tags with 2+ contributing cards are surfaced — a single stray card
// isn't a "build" yet, and showing it as one would just be noise every visit.
const ARCHETYPE_MIN_COUNT = 2;

export function deckArchetypes(deck) {
  const counts = {};
  for (const card of deck) {
    const def = CARD_DEFS[card.defId];
    if (!def) continue;
    const tags = new Set();
    for (const eff of def.effects) {
      // handSize needs its sign checked — Purge's -1 (give up a card slot to
      // cleanse) isn't a "Draw" build lean, it's the opposite of one.
      const tag = eff.type === "currentTime" || eff.type === "trueDamage"
        ? (eff.target === "opponent" ? "Aggro" : null)
        : eff.type === "handSize" && eff.amount < 0
        ? null
        : ARCHETYPE_BY_EFFECT[eff.type];
      if (tag) tags.add(tag);
    }
    for (const tag of tags) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= ARCHETYPE_MIN_COUNT)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

// "Build: Poison x3   Shield x2" (top 3 tags) or "" once nothing's leaning
// yet — callers should just leave/blank the label out in that case.
export function formatBuildSummary(deck) {
  const archetypes = deckArchetypes(deck).slice(0, 3);
  if (!archetypes.length) return "";
  return "Build: " + archetypes.map((a) => `${a.tag} x${a.count}`).join("   ");
}

export function CardDatabase() {}
