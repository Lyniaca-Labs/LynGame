import { useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { Entity } from "../../api";
import { presentComponentIcons } from "../../lib/entityIcons";
import type { GameViewHandle } from "./GameView";

// The 9 corner/edge pins understood by the engine's Anchor component
// (source/engine/components/Anchor.js) — kept in sync with ANCHOR_FACTORS
// there so "pin to corner" here maps to a real, valid anchor value.
const CORNERS = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

const DEFAULT_SIZE = 32;
const NUDGE = 1;
const NUDGE_FAST = 10;

function effectiveComponents(
  entity: Entity,
  prefabCache: Record<string, { components: Record<string, Record<string, unknown>> }>
): Record<string, Record<string, unknown>> {
  if (entity.prefab) {
    return { ...prefabCache[entity.prefab]?.components, ...entity.overrides };
  }
  return entity.components ?? {};
}

function entitySize(components: Record<string, Record<string, unknown>>) {
  let width = 0;
  let height = 0;
  for (const key of ["SpriteRenderer", "ShapeRenderer", "TextRenderer"]) {
    const c = components[key];
    if (!c) continue;
    width = Math.max(width, Number(c.width) || 0);
    height = Math.max(height, Number(c.height) || 0);
  }
  return { width: width || DEFAULT_SIZE, height: height || DEFAULT_SIZE };
}

interface SceneCanvasProps {
  // Optional: only needed for best-effort thumbnails (via the engine's
  // hidden preview iframe). The canvas itself — boxes, selection, drag,
  // arrow-nudge, corner-pin — works purely off scene JSON and never
  // requires a build or a running game.
  gameViewRef?: React.RefObject<GameViewHandle>;
}

export function SceneCanvas({ gameViewRef }: SceneCanvasProps) {
  const { scene, target, openEntity, setComponentFields, addComponent, removeComponent, prefabCache } =
    useSceneEditor();

  const [dragState, setDragState] = useState<{
    entityId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);

  // Canvas pan (drag empty background to look around) — separate from
  // per-entity dragState above. Applied as a CSS transform on the entity
  // layer, so entities' own x/y stay in plain world coordinates.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  if (!scene) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-[var(--color-text-faint)]">
        Select or create a scene to lay out its entities here.
      </div>
    );
  }

  const sceneId = scene.name;
  const selectedId = target?.kind === "entity" && target.sceneId === sceneId ? target.entityId : null;

  const positionable = scene.entities
    .map((entity) => {
      const components = effectiveComponents(entity, prefabCache);
      const transform = components.Transform;
      if (!transform) return null;
      const baseX = Number(transform.x) || 0;
      const baseY = Number(transform.y) || 0;
      const { width, height } = entitySize(components);
      const isDragging = dragState?.entityId === entity.id;
      return {
        entity,
        components,
        width,
        height,
        x: isDragging ? dragState.x : baseX,
        y: isDragging ? dragState.y : baseY,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const selected = positionable.find((p) => p.entity.id === selectedId) ?? null;

  const handlePointerDown = (e: React.PointerEvent, entityId: string, x: number, y: number) => {
    e.stopPropagation();
    openEntity(sceneId, entityId);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      entityId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: x,
      startY: y,
      x,
      y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    setDragState({ ...dragState, x: dragState.startX + dx, y: dragState.startY + dy });
  };

  const commitDrag = (e: React.PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    setComponentFields(dragState.entityId, "Transform", {
      x: Math.round(dragState.x),
      y: Math.round(dragState.y),
    });
    setDragState(null);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!selected) return;
    const transform = selected.components.Transform;
    setComponentFields(selected.entity.id, "Transform", {
      x: (Number(transform.x) || 0) + dx,
      y: (Number(transform.y) || 0) + dy,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    const amount = e.shiftKey ? NUDGE_FAST : NUDGE;
    if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelected(-amount, 0); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelected(amount, 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelected(0, -amount); }
    else if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelected(0, amount); }
  };

  const pinToCorner = (entityId: string, hasAnchor: boolean, corner: string) => {
    if (!hasAnchor) addComponent(entityId, "Anchor");
    setComponentFields(entityId, "Anchor", { anchor: corner });
  };

  // Background drag-to-pan. Entity boxes and the corner-pin panel both
  // stopPropagation on their own pointerdown, so this only ever fires for a
  // genuine click on empty canvas — no need to check the event target.
  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanDrag({
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    });
  };

  const handleBackgroundPointerMove = (e: React.PointerEvent) => {
    if (!panDrag || e.pointerId !== panDrag.pointerId) return;
    setPan({
      x: panDrag.startPanX + (e.clientX - panDrag.startClientX),
      y: panDrag.startPanY + (e.clientY - panDrag.startClientY),
    });
  };

  const endBackgroundPan = (e: React.PointerEvent) => {
    if (!panDrag || e.pointerId !== panDrag.pointerId) return;
    setPanDrag(null);
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden outline-none ${panDrag ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        backgroundColor: "var(--color-bg-inset)",
        backgroundImage:
          "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={endBackgroundPan}
    >
      <button
        type="button"
        title="Center view"
        onClick={() => setPan({ x: 0, y: 0 })}
        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
      >
        <Crosshair size={13} />
      </button>

      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {positionable.map(({ entity, x, y, width, height }) => {
          const isSelected = entity.id === selectedId;
          return (
            <EntityBox
              key={entity.id}
              entity={entity}
              x={x}
              y={y}
              width={width}
              height={height}
              selected={isSelected}
              gameViewRef={gameViewRef}
              onPointerDown={(e) => handlePointerDown(e, entity.id, x, y)}
              onPointerMove={handlePointerMove}
              onPointerUp={commitDrag}
            />
          );
        })}

        {selected && (
          <CornerPinPanel
            x={selected.x}
            y={selected.y}
            height={selected.height}
            hasAnchor={!!selected.components.Anchor}
            onPin={(corner) => pinToCorner(selected.entity.id, !!selected.components.Anchor, corner)}
            onClear={() => removeComponent(selected.entity.id, "Anchor")}
          />
        )}
      </div>
    </div>
  );
}

function EntityBox({
  entity,
  x,
  y,
  width,
  height,
  selected,
  gameViewRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  entity: Entity;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  gameViewRef?: React.RefObject<GameViewHandle>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!gameViewRef) return;
    const key = JSON.stringify(entity);
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;
    let cancelled = false;
    gameViewRef.current
      ?.getEntityPreview(entity.id, { width: 64, height: 64, background: null })
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, gameViewRef]);

  const icons = presentComponentIcons(entity);

  return (
    <div
      className={`group absolute flex cursor-move items-center justify-center overflow-hidden rounded-sm border bg-[var(--color-bg-elevated)] ${
        selected
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          : "border-[var(--color-border)] hover:border-[var(--color-text-faint)]"
      }`}
      style={{ left: x - width / 2, top: y - height / 2, width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={entity.id}
    >
      {preview ? (
        <img src={preview} alt={entity.id} className="pointer-events-none h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="pointer-events-none h-full w-full bg-[var(--color-border)]/40" />
      )}
      <span className="pointer-events-none absolute -top-4 left-0 whitespace-nowrap text-[10px] text-[var(--color-text-muted)]">
        {entity.id}
      </span>
      {icons.length > 0 && (
        <div className="pointer-events-none absolute -right-1 -top-1 flex gap-0.5 rounded-sm bg-[var(--color-bg-elevated)] p-0.5">
          {icons.map((c) => (
            <span key={c.key} title={c.tooltip}>
              <c.icon
                size={9}
                className={`text-[var(--color-text-faint)] ${c.persistent ? "" : "opacity-0 group-hover:opacity-100"}`}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CornerPinPanel({
  x,
  y,
  height,
  hasAnchor,
  onPin,
  onClear,
}: {
  x: number;
  y: number;
  height: number;
  hasAnchor: boolean;
  onPin: (corner: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="absolute z-20 flex flex-col gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-lg"
      style={{ left: x - 42, top: y + height / 2 + 8 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-3 gap-1">
        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            title={`Pin to ${corner}`}
            onClick={() => onPin(corner)}
            className="h-4 w-4 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-accent)]"
          />
        ))}
      </div>
      {hasAnchor && (
        <button
          type="button"
          onClick={onClear}
          className="text-center text-[9px] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
        >
          Unpin
        </button>
      )}
    </div>
  );
}
