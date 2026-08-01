// TutorialController
// Runs the standalone "tutorial" scene — a short step-through of the core
// mechanics (STEPS below), navigable via Back/Next, ending in a button that
// drops the player straight into a real battle (engine.loadScene('main')).
// The Back/Next/Skip buttons call into nextStep/prevStep/skip below via
// their own thin wrapper files (TutorialNext.js etc — see PlayHandCard.js's
// header comment for why engine.callScript needs a dedicated file per
// action rather than just naming the function on the click handler).

import { playSound, clickThenLoadScene } from "./SoundEffects.js";

const STEPS = [
  {
    title: "Your Time Is Your Health",
    body: "You don't have hit points — you have seconds. Both fighters start with a pool of time, shown as the two bars on either side of the screen. Empty bar, you lose the round.",
  },
  {
    title: "The Shot Clock",
    body: "Your own clock drains live, in real seconds, while you decide your move. Think fast — the longer you take, the more time you burn just standing there deciding.",
  },
  {
    title: "Playing Cards",
    body: "Click a card, or press 1 / 2 / 3, to play it. Cards can attack, defend, heal, or manipulate either clock — some help you, some hurt your opponent, a few do both at once.",
  },
  {
    title: "Shield & Pace",
    body: "Shield blocks incoming damage, but decays a little every turn — it's a short-term buffer, not permanent armor. Pace speeds up both clocks the longer a round drags on, shown by the darkening edges of the screen.",
  },
  {
    title: "Between Rounds",
    body: "Win a round and keep whatever time you have left as coins. Spend them in the shop to buy, upgrade, or remove cards from your deck before the next fight — every round after that gets a little tougher.",
  },
];

function setText(engine, id, text) {
  const e = engine.getEntity(id);
  const tr = e && e.getComponent("TextRenderer");
  if (tr) tr.text = text;
}

function layout(engine) {
  const s = engine.state.tutorial;
  const step = STEPS[s.step];
  setText(engine, "tutorialStepLabel", `Step ${s.step + 1} / ${STEPS.length}`);
  setText(engine, "tutorialTitle", step.title);
  setText(engine, "tutorialBody", step.body);

  const backBtn = engine.getEntity("tutorialBackBtn");
  const backInteract = backBtn && backBtn.getComponent("Interactable");
  const backOp = backBtn && backBtn.getComponent("Opacity");
  const atStart = s.step === 0;
  if (backOp) backOp.value = atStart ? 0.35 : 1;
  if (backInteract) {
    backInteract.onClick = atStart ? "" : "engine.callScript('TutorialBack', entity, engine);";
    backInteract.cursor = atStart ? "default" : "pointer";
  }

  setText(engine, "tutorialNextBtn", s.step === STEPS.length - 1 ? "Start Fight" : "Next");
}

export function TutorialController(entity, engine, dt) {
  if (!engine.state.tutorial) {
    engine.state.tutorial = { step: 0 };
    layout(engine);
  }
}

export function nextStep(entity, engine) {
  const s = engine.state.tutorial;
  if (!s) return;
  if (s.step >= STEPS.length - 1) {
    engine.state.tutorial = null;
    clickThenLoadScene(engine, "main");
    return;
  }
  s.step += 1;
  playSound(engine, "click");
  layout(engine);
}

export function prevStep(entity, engine) {
  const s = engine.state.tutorial;
  if (!s || s.step <= 0) return;
  s.step -= 1;
  playSound(engine, "click");
  layout(engine);
}

export function skip(entity, engine) {
  engine.state.tutorial = null;
  clickThenLoadScene(engine, "main");
}
