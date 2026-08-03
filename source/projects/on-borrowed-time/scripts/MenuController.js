// MenuController
// Attached to the "controller" entity in scenes/menu.json. Starts the home
// screen's ambient track and fades it in gently — leaving the menu (Play/
// Tutorial/Card Directory buttons) fades it back out via clickThenLoadScene
// (SoundEffects.js), which reads the instance this registers through
// MusicController.js's engine.state.music.

import { setActiveMusic, approachVolume, MENU_MUSIC_VOLUME } from "./MusicController.js";

export function MenuController(entity, engine, dt) {
  const s = entity.state;
  if (!s.started) {
    s.started = true;
    s.volume = 0;
    s.instance = engine.audio.play("music/menu", { loop: true, volume: 0 });
    if (s.instance) setActiveMusic(engine, s.instance, 0);

    const overlay = engine.getEntity("fadeOverlay");
    const overlayOp = overlay && overlay.getComponent("Opacity");
    const overlayAnim = overlay && overlay.getComponent("Animator");
    if (overlayOp && overlayAnim) overlayAnim.animate(overlayOp, "value", 0, { duration: 0.7, easing: "easeOut" });
  }
  if (s.instance) {
    approachVolume(s.instance, s, MENU_MUSIC_VOLUME, dt, 0.6);
    setActiveMusic(engine, s.instance, s.volume);
  }
}
