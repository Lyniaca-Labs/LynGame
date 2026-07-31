const EMITTER_IDS = ["fountainEmitter", "smokeEmitter", "confettiEmitter", "mixedEmitter"];

export function ParticleStats(entity, engine, dt) {
  const text = entity.getComponent("TextRenderer");
  if (!text) return;

  let total = 0;
  const parts = [];
  for (const id of EMITTER_IDS) {
    const emitter = engine.query(`${id}:Emitter`);
    const count = emitter?.liveCount ?? 0;
    total += count;
    parts.push(`${id.replace("Emitter", "")}=${count}`);
  }

  text.text = `Live particles: ${total} (${parts.join(", ")})`;
}
