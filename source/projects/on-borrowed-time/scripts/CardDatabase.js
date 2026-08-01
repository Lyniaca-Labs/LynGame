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

export const CARD_DEFS = {
  strike: {
    id: "strike", name: "Strike", tier: 1, price: 10, category: "attack",
    color: "#7f1d1d", icon: "#ef4444",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -2 }],
  },
  heavyStrike: {
    id: "heavyStrike", name: "Heavy Strike", tier: 2, price: 20, category: "attack",
    color: "#7f1d1d", icon: "#b91c1c",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -4 }],
  },
  guard: {
    id: "guard", name: "Guard", tier: 1, price: 11, category: "defense",
    color: "#1e3a5f", icon: "#3b82f6",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 3 }],
  },
  reinforce: {
    id: "reinforce", name: "Reinforce", tier: 3, price: 24, category: "defense",
    color: "#1e3a5f", icon: "#2563eb",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 6 }],
  },
  fortify: {
    id: "fortify", name: "Fortify", tier: 2, price: 18, category: "defense",
    color: "#1e3a5f", icon: "#60a5fa",
    descTemplate: "Increase your max time by {amt}s.",
    effects: [{ type: "maxTime", target: "self", amount: 2 }],
  },
  mend: {
    id: "mend", name: "Mend", tier: 1, price: 11, category: "heal",
    color: "#14532d", icon: "#22c55e",
    descTemplate: "Restore {amt}s.",
    effects: [{ type: "currentTime", target: "self", amount: 3 }],
  },
  secondWind: {
    id: "secondWind", name: "Second Wind", tier: 2, price: 19, category: "heal",
    color: "#14532d", icon: "#4ade80",
    descTemplate: "Increase your regen by {amt}s.",
    effects: [{ type: "regen", target: "self", amount: 2 }],
  },
  exhaust: {
    id: "exhaust", name: "Exhaust", tier: 2, price: 18, category: "utility",
    color: "#374151", icon: "#9ca3af",
    descTemplate: "Reduce opponent's regen by {amt}s.",
    effects: [{ type: "regen", target: "opponent", amount: -0.5 }],
  },
  focus: {
    id: "focus", name: "Focus", tier: 2, price: 16, category: "utility",
    color: "#3b2f5e", icon: "#a78bfa",
    descTemplate: "Slow your own clock for the rest of the fight.",
    effects: [{ type: "drainRate", target: "self", amount: -0.25 }],
  },
  haste: {
    id: "haste", name: "Haste", tier: 2, price: 19, category: "utility",
    color: "#5b3a29", icon: "#f59e0b",
    descTemplate: "Draw {amt} extra card(s) next hand.",
    effects: [{ type: "handSize", target: "self", amount: 1 }],
  },
  drainStrike: {
    id: "drainStrike", name: "Drain Strike", tier: 2, price: 20, category: "attack",
    color: "#4a1942", icon: "#e879f9",
    descTemplate: "Deal {amt} damage and heal {amt2}.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -1 },
      { type: "currentTime", target: "self", amount: 1 },
    ],
  },
  // The one rare max-time card — see the header comment for why it's kept
  // small (0.5-1.5s base) instead of scaled up like the direct-damage cards.
  timeSteal: {
    id: "timeSteal", name: "Time Steal", tier: 3, price: 22, category: "attack",
    color: "#4a1942", icon: "#d946ef",
    descTemplate: "Reduce opponent's max time by {amt}s.",
    effects: [{ type: "maxTime", target: "opponent", amount: -1 }],
  },
  // The one card using "trueDamage" (CardEffects.js) instead of
  // "currentTime" — it skips shield absorption entirely, at the cost of
  // chip damage to yourself. Kept to a modest amount since ignoring shield
  // outright is strong even before factoring in the self-damage.
  pierceStrike: {
    id: "pierceStrike", name: "Piercing Strike", tier: 2, price: 19, category: "attack",
    color: "#7f1d1d", icon: "#fca5a5",
    descTemplate: "Deal {amt} damage that ignores shield, but take {amt2} damage yourself.",
    effects: [
      { type: "trueDamage", target: "opponent", amount: -3 },
      { type: "currentTime", target: "self", amount: -1 },
    ],
  },
  // Shield now decays by half each turn-end (resolveTurnEnd in
  // BattleController.js) — these two are the only levers on that rate.
  anchor: {
    id: "anchor", name: "Anchor", tier: 2, price: 18, category: "defense",
    color: "#1e3a5f", icon: "#93c5fd",
    // shieldRetain amounts are percentage-points (CardEffects.js divides by
    // 100 when applying) purely so formatDescription's raw-number {amt}
    // substitution reads naturally here ("20") instead of "0.2".
    descTemplate: "Your shield decays {amt}% slower for the rest of the fight.",
    effects: [{ type: "shieldRetain", target: "self", amount: 20 }],
  },
  corrode: {
    id: "corrode", name: "Corrode", tier: 2, price: 18, category: "utility",
    color: "#374151", icon: "#f97316",
    descTemplate: "Opponent's shield decays {amt}% faster for the rest of the fight.",
    effects: [{ type: "shieldRetain", target: "opponent", amount: -20 }],
  },
  // Ticking damage — see the "poison" case in CardEffects.js. Stacks if
  // played more than once; ticks for both sides every turn-end regardless
  // of whose turn it was, same cadence as shield decay.
  borrowedTime: {
    id: "borrowedTime", name: "Borrowed Time", tier: 2, price: 20, category: "utility",
    color: "#4a1942", icon: "#c026d3",
    descTemplate: "Opponent's time bleeds {amt}s every turn for the rest of the fight.",
    effects: [{ type: "poison", target: "opponent", amount: 1.5 }],
  },
  // The one "timeless" flag-effect card — see BattleController.js's phase
  // drain code, which skips intensityMultiplier(b) entirely for a side with
  // this set. Strong and permanent, priced/tiered accordingly.
  timeless: {
    id: "timeless", name: "Timeless", tier: 3, price: 23, category: "utility",
    color: "#1e293b", icon: "#e2e8f0",
    descTemplate: "Your clock ignores pace for the rest of the fight.",
    effects: [{ type: "timeless", target: "self", amount: 1 }],
  },
  // "pace" is battle-level, not per-side — resolveEffects() no-ops on it;
  // playCard (BattleController.js) reads this effect straight off the def
  // and rolls back b.roundElapsed directly, which is what pace is derived
  // from (intensityMultiplier). Affects both sides equally since pace is
  // shared, so it reads as "reset some of the built-up intensity."
  timeOut: {
    id: "timeOut", name: "Time Out", tier: 2, price: 17, category: "utility",
    color: "#164e63", icon: "#67e8f9",
    descTemplate: "Roll back {amt}s of the fight's built-up pace.",
    effects: [{ type: "pace", target: "self", amount: -8 }],
  },
  // Risk/reward archetype — all four give a bigger payoff than their "safe"
  // equivalent in exchange for a permanent-for-the-fight cost. Upgrading
  // scales both numbers together so the risk:reward ratio stays constant
  // instead of the downside becoming trivial at high card level.
  overclock: {
    id: "overclock", name: "Overclock", tier: 3, price: 26, category: "attack",
    color: "#7c2d12", icon: "#f97316",
    descTemplate: "Deal {amt} damage, but your own clock speeds up by {amt2} for the rest of the fight.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -6 },
      { type: "drainRate", target: "self", amount: 0.3 },
    ],
  },
  bloodPact: {
    id: "bloodPact", name: "Blood Pact", tier: 2, price: 21, category: "attack",
    color: "#7c2d12", icon: "#ea580c",
    descTemplate: "Deal {amt} damage, but take {amt2} damage yourself.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -6 },
      { type: "currentTime", target: "self", amount: -2 },
    ],
  },
  allIn: {
    id: "allIn", name: "All-In", tier: 3, price: 25, category: "defense",
    color: "#7c2d12", icon: "#fb923c",
    descTemplate: "Gain {amt}s shield, but reduce your regen by {amt2}s for the rest of the fight.",
    effects: [
      { type: "shield", target: "self", amount: 9 },
      { type: "regen", target: "self", amount: -1 },
    ],
  },
  adrenalineRush: {
    id: "adrenalineRush", name: "Adrenaline Rush", tier: 3, price: 24, category: "utility",
    color: "#7c2d12", icon: "#fdba74",
    descTemplate: "Draw {amt} extra cards next hand, but your clock speeds up by {amt2} for the rest of the fight.",
    effects: [
      { type: "handSize", target: "self", amount: 2 },
      { type: "drainRate", target: "self", amount: 0.2 },
    ],
  },
};

export const STARTER_DECK = [
  "strike", "strike",
  "mend",
  "haste",
  "guard",
];

export const SHOP_POOL = Object.keys(CARD_DEFS);

export const AI_POOL = ["strike", "guard", "mend", "heavyStrike", "drainStrike", "timeSteal", "exhaust", "reinforce", "overclock", "pierceStrike", "anchor", "corrode", "borrowedTime", "timeless", "timeOut"];

export function formatDescription(def, level) {
  const scale = 1 + 0.5 * (level - 1);
  const nums = def.effects.map((e) => Math.round(Math.abs(e.amount) * scale * 10) / 10);
  return def.descTemplate.replace("{amt}", nums[0]).replace("{amt2}", nums[1]);
}

export function CardDatabase() {}
