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
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
  const {
    scene,
    target,
    openEntity,
    setComponentFields,
    addComponent,
    removeComponent,
    setOverrideFields,
    resetOverrideComponent,
    prefabCache,
  } = useSceneEditor();

  const [dragState, setDragState] = useState<{
    entity: Entity;
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
  const [zoom, setZoom] = useState(1);

  // Writes to a prefab instance's local overrides (its own components object
  // doesn't exist — see SceneEditorContext's setEntityPrefab), everything
  // else to its plain components. For plain entities, seeds the component
  // from its schema defaults first if it isn't present yet — e.g. an entity
  // with no Transform at all gets a real one on its first drag instead of
  // silently failing to move.
  const writeFields = (entity: Entity, componentName: string, fields: Record<string, unknown>) => {
    if (entity.prefab) {
      setOverrideFields(entity.id, componentName, fields);
    } else {
      if (!entity.components?.[componentName]) addComponent(entity.id, componentName);
      setComponentFields(entity.id, componentName, fields);
    }
  };

  const clearAnchor = (entity: Entity) => {
    if (entity.prefab) resetOverrideComponent(entity.id, "Anchor");
    else removeComponent(entity.id, "Anchor");
  };

  // React attaches its synthetic onWheel as a passive listener, so
  // preventDefault() inside it is a silent no-op (and logs a warning) —
  // has to be a real DOM listener registered with { passive: false } to
  // actually stop the page from scrolling while zooming the canvas.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.001), MIN_ZOOM, MAX_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // `scene` (not []): the ref only ends up on a real element once `scene`
    // has loaded (before that, the early-return placeholder below renders
    // instead, and rootRef.current is null) — depend on it so this effect
    // gets a second chance to attach once the real canvas div shows up,
    // instead of only ever trying once at mount and giving up for good if
    // that first render happened to be the loading placeholder.
  }, [scene]);

  if (!scene) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-[var(--color-text-faint)]">
        Select or create a scene to lay out its entities here.
      </div>
    );
  }

  const sceneId = scene.name;
  const selectedId = target?.kind === "entity" && target.sceneId === sceneId ? target.entityId : null;

  // Entities with no Transform anywhere in their effective components (most
  // often a prefab instance whose prefab never defined one) still get a box
  // at the origin, draggable like any other — dragging/nudging/pinning it
  // creates the Transform (as a plain component, or an override for a
  // prefab instance) via writeFields rather than requiring it to pre-exist.
  const positionable = scene.entities.map((entity) => {
    const components = effectiveComponents(entity, prefabCache);
    const transform = components.Transform;
    const baseX = Number(transform?.x) || 0;
    const baseY = Number(transform?.y) || 0;
    const { width, height } = entitySize(components);
    const isDragging = dragState?.entity.id === entity.id;
    return {
      entity,
      components,
      width,
      height,
      x: isDragging ? dragState.x : baseX,
      y: isDragging ? dragState.y : baseY,
    };
  });

  const selected = positionable.find((p) => p.entity.id === selectedId) ?? null;

  const handlePointerDown = (e: React.PointerEvent, entity: Entity, x: number, y: number) => {
    e.stopPropagation();
    openEntity(sceneId, entity.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      entity,
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
    // Screen-pixel movement maps to more world units the further zoomed
    // out we are (the entity layer is visually shrunk by `scale(zoom)`),
    // so divide by zoom to keep the box glued to the cursor either way.
    const dx = (e.clientX - dragState.startClientX) / zoom;
    const dy = (e.clientY - dragState.startClientY) / zoom;
    setDragState({ ...dragState, x: dragState.startX + dx, y: dragState.startY + dy });
  };

  const commitDrag = (e: React.PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    writeFields(dragState.entity, "Transform", {
      x: Math.round(dragState.x),
      y: Math.round(dragState.y),
    });
    setDragState(null);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!selected) return;
    const transform = selected.components.Transform;
    writeFields(selected.entity, "Transform", {
      x: (Number(transform?.x) || 0) + dx,
      y: (Number(transform?.y) || 0) + dy,
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

  const pinToCorner = (entity: Entity, corner: string) => {
    writeFields(entity, "Anchor", { anchor: corner });
  };

  const centerView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
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
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden outline-none ${panDrag ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        backgroundColor: "var(--color-bg-inset)",
        backgroundImage:
          "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
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
        onClick={centerView}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
      >
        <Crosshair size={13} />
      </button>

      <div className="absolute right-9 top-2 z-20 flex h-6 items-center rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1.5 text-[10px] text-[var(--color-text-faint)]">
        {Math.round(zoom * 100)}%
      </div>

      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
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
              onPointerDown={(e) => handlePointerDown(e, entity, x, y)}
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
            onPin={(corner) => pinToCorner(selected.entity, corner)}
            onClear={() => clearAnchor(selected.entity)}
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

  // The first build after project open often isn't ready yet by the time
  // every box on the canvas fires its initial fetch — EditorLayout's build()
  // dispatches this once the build (or rebuild) actually lands, same signal
  // the Inspector's own EntityPreview listens for, so a fetch that lost that
  // race gets a second try instead of showing "no preview" forever.
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener("entity-preview-refresh", handler);
    return () => window.removeEventListener("entity-preview-refresh", handler);
  }, []);

  useEffect(() => {
    if (!gameViewRef) return;
    const key = `${refreshKey}:${JSON.stringify(entity)}`;
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;
    let cancelled = false;

    // A `null` result usually means the initial build/preview-iframe wasn't
    // ready yet, not "this entity truly has nothing to render" — a real
    // project build can take several seconds, well past a single short
    // retry. getEntityPreview() itself already retries internally for up to
    // ~5s per call before giving up, so chaining several calls back-to-back
    // (no extra delay needed between them) covers a much longer real build
    // without hammering anything harder than one call already does.
    const MAX_ATTEMPTS = 5;
    const attempt = (n: number) => {
      gameViewRef.current
        ?.getEntityPreview(entity.id, { width: 64, height: 64, background: null })
        .then((dataUrl) => {
          if (cancelled) return;
          if (dataUrl == null && n < MAX_ATTEMPTS) {
            attempt(n + 1);
            return;
          }
          setPreview(dataUrl);
        });
    };
    attempt(0);

    return () => {
      cancelled = true;
    };
  }, [entity, gameViewRef, refreshKey]);

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
