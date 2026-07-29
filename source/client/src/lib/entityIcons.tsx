import { Camera, MousePointerClick, Film, Anchor } from "lucide-react";
import { Entity } from "../api";

// Which "special" components get a small identifying icon wherever an
// entity is listed (Explorer tree, scene canvas boxes) — shared so both
// places agree on the same icon/tooltip/persistence per component. Camera
// is persistent (always visible; a scene usually has just one active one,
// so it's worth calling out even without hovering); the rest only show on
// hover to keep things from getting noisy.
export const ENTITY_COMPONENT_ICONS: {
  key: string;
  icon: typeof Camera;
  tooltip: string;
  persistent?: boolean;
}[] = [
  { key: "Camera", icon: Camera, tooltip: "Camera", persistent: true },
  { key: "Interactable", icon: MousePointerClick, tooltip: "Interactable" },
  { key: "Animator", icon: Film, tooltip: "Animator" },
  { key: "Anchor", icon: Anchor, tooltip: "Anchor (pinned to viewport)" },
];

// Checks components + overrides (not full prefab defaults) — covers plain
// entities and whatever a prefab instance adds locally, without needing to
// fetch every referenced prefab's definition just to draw an icon.
export function presentComponentIcons(entity: Entity) {
  const present = { ...entity.components, ...entity.overrides };
  return ENTITY_COMPONENT_ICONS.filter((c) => present[c.key]);
}
