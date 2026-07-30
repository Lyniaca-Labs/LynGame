
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useProject } from "./ProjectContext";
import {
  projectsApi,
  prefabsApi,
  componentsApi,
  scriptsApi,
  scenesApi,
  animationsApi,
  Scene,
  Entity,
  ComponentDefinition,
  PrefabData,
  PrefabChildData,
  graphScriptsApi,
} from "../api";

// Prefab names are stored/keyed without their file extension throughout this
// context (entity.prefab, prefabCache, openPrefab) — matches Explorer.tsx's
// and Inspector.tsx's own copies of the same helper.
const stripExt = (name: string) => name.replace(/\.(js|ts|json)$/i, "");

// --- prefab children tree helpers ---
// A prefab's `children` is a real nested tree (Record<string, PrefabChildData>,
// each of which can have its own `children`), addressed everywhere else in
// this feature (overrides, Entity.getChild/query) by a dot-joined path of
// childName segments, e.g. "description.badge". These three helpers are the
// only place that walks/rewrites that tree; everything else just calls them.

function getPrefabChildNode(
  root: PrefabData | PrefabChildData,
  path: string
): PrefabChildData | undefined {
  let node: PrefabData | PrefabChildData = root;
  for (const segment of path.split(".")) {
    const next = node.children?.[segment];
    if (!next) return undefined;
    node = next;
  }
  return node as PrefabChildData;
}

// The children record a new/removed/renamed child lives in — the prefab's
// own `children` when parentPath is "" (root), otherwise the named node's.
function getChildrenContainer(
  prefab: PrefabData,
  parentPath: string
): Record<string, PrefabChildData> {
  if (!parentPath) return prefab.children ?? {};
  return getPrefabChildNode(prefab, parentPath)?.children ?? {};
}

function setChildrenContainer(
  prefab: PrefabData,
  parentPath: string,
  children: Record<string, PrefabChildData>
): PrefabData {
  if (!parentPath) return { ...prefab, children };
  return updatePrefabChildNode(prefab, parentPath, (node) => ({ ...node, children }));
}

// Immutably rewrites the node at `path` using `updater`; a no-op if any
// segment of `path` doesn't exist (e.g. the child was deleted concurrently).
function updatePrefabChildNode(
  prefab: PrefabData,
  path: string,
  updater: (node: PrefabChildData) => PrefabChildData
): PrefabData {
  const segments = path.split(".");
  function recur(node: PrefabData | PrefabChildData, i: number): PrefabData | PrefabChildData {
    const segment = segments[i];
    const child = node.children?.[segment];
    if (!child) return node;
    const updatedChild = i === segments.length - 1 ? updater(child) : (recur(child, i + 1) as PrefabChildData);
    return { ...node, children: { ...node.children, [segment]: updatedChild } };
  }
  return recur(prefab, 0) as PrefabData;
}

const MAX_HISTORY = 100;

// Returns `rootId` plus every descendant reachable through Entity.parentId,
// root first — the unit of work for delete/duplicate/copy/move, since those
// all need to carry a card's whole bg+art+text+icon subtree along together,
// not just the one entity clicked.
function collectSubtree(entities: Entity[], rootId: string): Entity[] {
  const byParent = new Map<string, Entity[]>();
  for (const e of entities) {
    if (!e.parentId) continue;
    const list = byParent.get(e.parentId) ?? [];
    list.push(e);
    byParent.set(e.parentId, list);
  }

  const root = entities.find((e) => e.id === rootId);
  if (!root) return [];

  const result: Entity[] = [];
  const stack = [root];
  while (stack.length) {
    const e = stack.pop()!;
    result.push(e);
    stack.push(...(byParent.get(e.id) ?? []));
  }
  return result;
}

// Deep-clones `subtree` (as returned by collectSubtree, root first) with
// fresh ids unique against `existingEntities`, remapping internal
// parent/child links so the cloned subtree's shape is preserved. The
// clone's root is re-parented to `newParentId`. Shared by duplicateEntity,
// copyEntity/pasteEntity, and moveEntityToScene.
function cloneSubtreeWithNewIds(
  subtree: Entity[],
  existingEntities: Entity[],
  newParentId: string | null
): { entities: Entity[]; newRootId: string } {
  const existingIds = new Set(existingEntities.map((e) => e.id));
  const idMap = new Map<string, string>();

  for (const e of subtree) {
    const base = e.id.replace(/_copy\d*$/, "");
    let newId = `${base}_copy`;
    let n = 1;
    while (existingIds.has(newId) || idMap.has(newId)) {
      n += 1;
      newId = `${base}_copy${n}`;
    }
    existingIds.add(newId);
    idMap.set(e.id, newId);
  }

  const rootOriginalId = subtree[0].id;
  const entities = subtree.map((e) => {
    const clone: Entity = structuredClone(e);
    clone.id = idMap.get(e.id)!;
    if (e.id === rootOriginalId) {
      clone.parentId = newParentId ?? undefined;
    } else if (clone.parentId && idMap.has(clone.parentId)) {
      clone.parentId = idMap.get(clone.parentId);
    }
    return clone;
  });

  return { entities, newRootId: idMap.get(rootOriginalId)! };
}

export type InspectorTarget =
  | { kind: "scene"; sceneId: string }
  | { kind: "entity"; sceneId: string; entityId: string }
  | { kind: "prefab"; prefabName: string }
  // A child *within a prefab's own definition* (authoring the prefab, e.g.
  // adding/editing Card's "icon" child) — distinct from instanceChild below.
  | { kind: "prefabChild"; prefabName: string; path: string }
  // A "ghost" child of a prefab instance in a scene — inherited from the
  // prefab, editable only via per-field overrides (see instanceChild
  // functions below), not structurally.
  | { kind: "instanceChild"; sceneId: string; entityId: string; path: string }
  | null;

interface SceneEditorContextValue {
  target: InspectorTarget;
  scene: Scene | null;

  loading: boolean;
  error: string | null;
  dirty: boolean;
  saving: boolean;

  // Cache of fetched prefab definitions, keyed by prefab name. Populated
  // lazily as entities using a prefab are inspected.
  prefabCache: Record<string, PrefabData>;

  // Mutable working copy of whichever prefab is currently open in the
  // Inspector (target.kind === "prefab"). Distinct from prefabCache, which
  // holds read-only snapshots used to compute entity overrides elsewhere.
  prefabDraft: PrefabData | null;

  openScene: (sceneId: string) => void;
  openEntity: (sceneId: string, entityId: string) => void;
  openPrefab: (prefabName: string) => void;
  openPrefabChild: (prefabName: string, path: string) => void;
  openInstanceChild: (sceneId: string, entityId: string, path: string) => void;
  clear: () => void;

  renameEntity: (entityId: string, newId: string) => void;

  updateComponentField: (
    entityId: string,
    componentName: string,
    field: string,
    value: unknown
  ) => void;
  // Same as updateComponentField, but merges several fields in as a single
  // history entry — used by the scene canvas so dragging an entity (which
  // touches both x and y) undoes in one Ctrl+Z instead of two.
  setComponentFields: (
    entityId: string,
    componentName: string,
    fields: Record<string, unknown>
  ) => void;
  addComponent: (entityId: string, componentName: string) => void;
  removeComponent: (entityId: string, componentName: string) => void;

  // prefab attach/detach + editing the entity's local overrides
  setEntityPrefab: (entityId: string, prefabName: string | null) => void;
  updateOverrideField: (
    entityId: string,
    componentName: string,
    field: string,
    value: unknown
  ) => void;
  setOverrideFields: (
    entityId: string,
    componentName: string,
    fields: Record<string, unknown>
  ) => void;
  resetOverrideComponent: (entityId: string, componentName: string) => void;

  addScript: (entityId: string, scriptName: string) => void;
  removeScript: (entityId: string, index: number) => void;

  // editing the prefab itself (target.kind === "prefab")
  updatePrefabComponentField: (componentName: string, field: string, value: unknown) => void;
  addPrefabComponent: (componentName: string) => void;
  removePrefabComponent: (componentName: string) => void;
  addPrefabScript: (scriptName: string) => void;
  removePrefabScript: (index: number) => void;

  // structural editing of a prefab's own children tree (target.kind ===
  // "prefab" or "prefabChild") — adding/renaming/removing a child, and
  // editing its components/scripts. `path` is "" for a root-level child,
  // otherwise the dot-path of the parent it's being added under/edited at.
  addPrefabChild: (parentPath: string, childName: string) => void;
  renamePrefabChild: (parentPath: string, oldName: string, newName: string) => void;
  removePrefabChild: (parentPath: string, childName: string) => void;
  updatePrefabChildComponentField: (
    path: string,
    componentName: string,
    field: string,
    value: unknown
  ) => void;
  addPrefabChildComponent: (path: string, componentName: string) => void;
  removePrefabChildComponent: (path: string, componentName: string) => void;
  addPrefabChildScript: (path: string, scriptName: string) => void;
  removePrefabChildScript: (path: string, index: number) => void;

  // per-instance overrides on a prefab's ghost children (target.kind ===
  // "instanceChild") — field-level only, mirrors updateOverrideField/
  // resetOverrideComponent above but addressed by child dot-path.
  updateChildOverrideField: (
    entityId: string,
    path: string,
    componentName: string,
    field: string,
    value: unknown
  ) => void;
  resetChildOverrideComponent: (entityId: string, path: string, componentName: string) => void;
  addChildOverrideScript: (entityId: string, path: string, scriptName: string) => void;
  removeChildOverrideScript: (entityId: string, path: string, index: number) => void;

  addEntity: (parentId?: string | null) => Promise<void>;
  deleteEntity: (entityId: string) => void; // cascades to the entity's whole child subtree

  // hierarchy: reparenting, duplicate, copy/paste, cross-scene move
  setEntityParent: (
    entityId: string,
    parentId: string | null,
    referenceId?: string,
    position?: "before" | "after"
  ) => void;
  duplicateEntity: (entityId: string) => void;
  entityClipboard: Entity[] | null;
  copyEntity: (entityId: string) => void;
  pasteEntity: (parentId?: string | null) => void;
  moveEntityToScene: (
    entityId: string,
    targetSceneId: string,
    onMoved?: () => void,
    newParentId?: string | null
  ) => Promise<void>;

  save: () => Promise<void>;

  // to add
  createComponent: () => Promise<void>;
  deleteComponent: (name: string) => Promise<void>;
  createScript: () => Promise<void>;
  deleteScript: (name: string) => Promise<void>;
  createGraphScript: () => Promise<void>;
  deleteGraphScript: (name: string) => Promise<void>;
  createScene: () => Promise<void>;
  deleteScene: (name: string) => Promise<void>;
  setStartScene: (sceneId: string) => Promise<void>;
  createPrefab: () => Promise<void>;
  deletePrefab: (name: string) => Promise<void>;
  createAnimation: () => Promise<void>;
  deleteAnimation: (name: string) => Promise<void>;

  // dedicated full-screen clip editor (Explorer + Inspector both open it)
  editingClipName: string | null;
  openClipEditor: (name: string) => void;
  closeClipEditor: () => void;

  // undo/redo over the currently-open scene draft or prefab draft (whole-
  // object snapshot per edit — see updateEntity/updatePrefabDraft). Does NOT
  // cover moveEntityToScene or any create/delete-file operation, which
  // already persist to the server immediately.
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const SceneEditorContext = createContext<SceneEditorContextValue | null>(null);

export function SceneEditorProvider({ children }: { children: ReactNode }) {
  const { currentProject, projectData, reloadProject } = useProject();

  const [target, setTarget] = useState<InspectorTarget>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prefabCache, setPrefabCache] = useState<Record<string, PrefabData>>({});
  const [prefabDraft, setPrefabDraft] = useState<PrefabData | null>(null);

  // In-memory clipboard for entity copy/paste — a plain ref-backed subtree
  // snapshot (root + descendants), not tied to any one scene, so paste can
  // target a different scene than the one that was copied. Mirrors the
  // clipboard pattern in GraphEditor.tsx (copySelection/pasteClipboard).
  const [entityClipboard, setEntityClipboard] = useState<Entity[] | null>(null);

  // Undo/redo history: refs (not state) since pushing a snapshot shouldn't
  // itself trigger a re-render — every push already happens alongside a
  // setScene/setPrefabDraft call that re-renders for its own reason. Mirrors
  // the ref-based past/future stacks in GraphEditor.tsx.
  const sceneHistoryRef = useRef<{ past: Scene[]; future: Scene[] }>({ past: [], future: [] });
  const prefabHistoryRef = useRef<{ past: PrefabData[]; future: PrefabData[] }>({ past: [], future: [] });

  const [editingClipName, setEditingClipName] = useState<string | null>(null);
  const openClipEditor = useCallback((name: string) => setEditingClipName(name), []);
  const closeClipEditor = useCallback(() => setEditingClipName(null), []);

  // Reset every project-scoped piece of state when switching projects.
  // Without this, target/prefabCache/entityClipboard/undo history from the
  // previous project leak into the new one — most visibly, a scene or
  // prefab in the new project that happens to share a name with one already
  // cached would keep showing the OLD project's data instead of refetching.
  useEffect(() => {
    setTarget(null);
    setScene(null);
    setDirty(false);
    setPrefabCache({});
    setPrefabDraft(null);
    setEntityClipboard(null);
    setEditingClipName(null);
    sceneHistoryRef.current = { past: [], future: [] };
    prefabHistoryRef.current = { past: [], future: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  function pushSceneSnapshot(snapshot: Scene) {
    const h = sceneHistoryRef.current;
    h.past.push(structuredClone(snapshot));
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
  }

  function pushPrefabSnapshot(snapshot: PrefabData) {
    const h = prefabHistoryRef.current;
    h.past.push(structuredClone(snapshot));
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
  }

  // Load the scene whenever the selected scene changes (regardless of
  // whether the target is the scene itself, an entity inside it, or one of
  // that entity's ghost prefab children).
  const targetSceneId =
    target?.kind === "scene" || target?.kind === "entity" || target?.kind === "instanceChild"
      ? target.sceneId
      : null;

  useEffect(() => {
    if (!targetSceneId || !currentProject) {
      setScene(null);
      return;
    }

    setLoading(true);
    setError(null);

    projectsApi
      .getScene(currentProject, targetSceneId)
      .then((res) => setScene(res.scene))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    setDirty(false);
    sceneHistoryRef.current = { past: [], future: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSceneId, currentProject]);

  // Load the prefab whenever a prefab (or one of its own children) becomes
  // the inspector target. This is a separate working copy from prefabCache
  // so editing it doesn't fight with the read-only snapshots used to compute
  // overrides elsewhere.
  const prefabTargetName =
    target?.kind === "prefab" || target?.kind === "prefabChild" ? target.prefabName : null;

  useEffect(() => {
    if (!prefabTargetName || !currentProject) {
      setPrefabDraft(null);
      return;
    }

    setLoading(true);
    setError(null);
    prefabHistoryRef.current = { past: [], future: [] };

    let cancelled = false;

    prefabsApi
      .get(currentProject, prefabTargetName)
      .then((data) => {
        if (!cancelled) setPrefabDraft(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    setDirty(false);

    return () => {
      cancelled = true;
    };
  }, [prefabTargetName, currentProject]);

  // Lazily fetch the prefab definition for whichever entity is currently
  // being inspected, so the Overrides panel has defaults + a field shape
  // to merge the entity's own overrides against.
  useEffect(() => {
    if (!currentProject || !scene || (target?.kind !== "entity" && target?.kind !== "instanceChild")) return;
    const entity = scene.entities.find((e) => e.id === target.entityId);
    if (!entity?.prefab || prefabCache[entity.prefab]) return;

    const prefabName = entity.prefab;
    let cancelled = false;

    prefabsApi
      .get(currentProject, prefabName)
      .then((data) => {
        if (!cancelled) setPrefabCache((prev) => ({ ...prev, [prefabName]: data }));
      })
      .catch(() => {
        // Leave uncached — the Overrides panel just shows a loading state
        // until this succeeds (e.g. on next inspect).
      });

    return () => {
      cancelled = true;
    };
  }, [currentProject, scene, target, prefabCache]);

  // Eagerly fetch EVERY project prefab into prefabCache (not just ones some
  // inspected entity happens to reference) — the Explorer tree needs every
  // prefab's `children` to render both a prefab's own authoring row and any
  // instance's ghost children, and prefabCache is the one cache save()
  // already keeps in sync (see updatePrefabComponentField and friends via
  // save() below). A second, disconnected cache here would just go stale
  // the moment an edit is saved while some other target is being inspected.
  useEffect(() => {
    if (!projectData || !currentProject) return;

    let cancelled = false;

    projectData.prefabs.forEach((prefabFile) => {
      const prefabName = stripExt(prefabFile);
      if (prefabCache[prefabName]) return;

      prefabsApi
        .get(currentProject, prefabName)
        .then((data) => {
          if (!cancelled) setPrefabCache((prev) => ({ ...prev, [prefabName]: data }));
        })
        .catch(() => {
          // Leave uncached — re-attempted next time projectData/prefabCache changes.
        });
    });

    return () => {
      cancelled = true;
    };
  }, [projectData, currentProject, prefabCache]);

  const openScene = useCallback((sceneId: string) => {
    setTarget({ kind: "scene", sceneId });
  }, []);

  const openEntity = useCallback((sceneId: string, entityId: string) => {
    setTarget({ kind: "entity", sceneId, entityId });
  }, []);

  const openPrefab = useCallback((prefabName: string) => {
    setTarget({ kind: "prefab", prefabName });
  }, []);

  const openPrefabChild = useCallback((prefabName: string, path: string) => {
    setTarget({ kind: "prefabChild", prefabName, path });
  }, []);

  const openInstanceChild = useCallback((sceneId: string, entityId: string, path: string) => {
    setTarget({ kind: "instanceChild", sceneId, entityId, path });
  }, []);

  const clear = useCallback(() => setTarget(null), []);

  const updateEntity = useCallback((entityId: string, updater: (e: Entity) => Entity) => {
    setScene((prev) => {
      if (!prev) return prev;
      pushSceneSnapshot(prev);
      return { ...prev, entities: prev.entities.map((e) => (e.id === entityId ? updater(e) : e)) };
    });
    setDirty(true);
  }, []);

  const renameEntity = useCallback((entityId: string, newId: string) => {
    const trimmed = newId.trim();
    if (!trimmed || trimmed === entityId) return;

    setScene((prev) => {
      if (!prev) return prev;
      // Refuse silently on a collision — the Inspector checks this too and
      // shows an inline error before ever calling this.
      if (prev.entities.some((e) => e.id === trimmed)) return prev;
      pushSceneSnapshot(prev);
      return {
        ...prev,
        entities: prev.entities.map((e) => (e.id === entityId ? { ...e, id: trimmed } : e)),
      };
    });
    setDirty(true);
    setTarget((prev) =>
      (prev?.kind === "entity" || prev?.kind === "instanceChild") && prev.entityId === entityId
        ? { ...prev, entityId: trimmed }
        : prev
    );
  }, []);

  const updateComponentField = useCallback(
    (entityId: string, componentName: string, field: string, value: unknown) => {
      updateEntity(entityId, (e) => ({
        ...e,
        components: {
          ...e.components,
          [componentName]: { ...e.components?.[componentName], [field]: value },
        },
      }));
    },
    [updateEntity]
  );

  const setComponentFields = useCallback(
    (entityId: string, componentName: string, fields: Record<string, unknown>) => {
      updateEntity(entityId, (e) => ({
        ...e,
        components: {
          ...e.components,
          [componentName]: { ...e.components?.[componentName], ...fields },
        },
      }));
    },
    [updateEntity]
  );

  const addComponent = useCallback(
    (entityId: string, componentName: string) => {
      const schema: ComponentDefinition | undefined = projectData?.components?.[componentName];
      if (!schema) return;

      // Seed the new component with the registry's default values. Vector
      // defaults are cloned so multiple entities don't end up sharing the
      // same object reference.
      const defaults = Object.fromEntries(
        schema.fields.map((f) => [
          f.key,
          f.type === "vector"
            ? { ...(f.defaultValue as Record<string, number>) }
            : f.defaultValue,
        ])
      );

      updateEntity(entityId, (e) => ({
        ...e,
        components: { ...e.components, [componentName]: defaults },
      }));
    },
    [projectData, updateEntity]
  );

  const removeComponent = useCallback(
    (entityId: string, componentName: string) => {
      updateEntity(entityId, (e) => {
        const rest = { ...e.components };
        delete rest[componentName];
        return { ...e, components: rest };
      });
    },
    [updateEntity]
  );

  const setEntityPrefab = useCallback(
    (entityId: string, prefabName: string | null) => {
      updateEntity(entityId, (e) => {
        if (prefabName === null) {
          // Detach: fold whatever overrides existed back in as the entity's
          // own plain components.
          const next = { ...e };
          const priorOverrides = next.overrides;
          delete next.prefab;
          delete next.overrides;
          return { ...next, components: priorOverrides ?? {} };
        }
        // Attach: drop any plain components, start with a clean override set.
        const next = { ...e };
        delete next.components;
        return { ...next, prefab: prefabName, overrides: {} };
      });
    },
    [updateEntity]
  );

  const updateOverrideField = useCallback(
    (entityId: string, componentName: string, field: string, value: unknown) => {
      updateEntity(entityId, (e) => ({
        ...e,
        overrides: {
          ...e.overrides,
          [componentName]: { ...e.overrides?.[componentName], [field]: value },
        },
      }));
    },
    [updateEntity]
  );

  // Same as updateOverrideField, but merges several fields as one history
  // entry — the override-side counterpart to setComponentFields, for the
  // same reason (e.g. dragging a prefab instance in the scene canvas
  // touches both x and y of its Transform override).
  const setOverrideFields = useCallback(
    (entityId: string, componentName: string, fields: Record<string, unknown>) => {
      updateEntity(entityId, (e) => ({
        ...e,
        overrides: {
          ...e.overrides,
          [componentName]: { ...e.overrides?.[componentName], ...fields },
        },
      }));
    },
    [updateEntity]
  );

  const resetOverrideComponent = useCallback(
    (entityId: string, componentName: string) => {
      updateEntity(entityId, (e) => {
        const rest = { ...e.overrides };
        delete rest[componentName];
        return { ...e, overrides: rest };
      });
    },
    [updateEntity]
  );

  const updateChildOverrideField = useCallback(
    (entityId: string, path: string, componentName: string, field: string, value: unknown) => {
      updateEntity(entityId, (e) => ({
        ...e,
        overrides: {
          ...e.overrides,
          children: {
            ...e.overrides?.children,
            [path]: {
              ...e.overrides?.children?.[path],
              [componentName]: {
                ...(e.overrides?.children?.[path]?.[componentName] as Record<string, unknown> | undefined),
                [field]: value,
              },
            },
          },
        },
      }));
    },
    [updateEntity]
  );

  const resetChildOverrideComponent = useCallback(
    (entityId: string, path: string, componentName: string) => {
      updateEntity(entityId, (e) => {
        const childOverride = { ...e.overrides?.children?.[path] };
        delete childOverride[componentName];
        return {
          ...e,
          overrides: { ...e.overrides, children: { ...e.overrides?.children, [path]: childOverride } },
        };
      });
    },
    [updateEntity]
  );

  const addChildOverrideScript = useCallback(
    (entityId: string, path: string, scriptName: string) => {
      updateEntity(entityId, (e) => {
        const existing = e.overrides?.children?.[path]?.scripts ?? [];
        return {
          ...e,
          overrides: {
            ...e.overrides,
            children: {
              ...e.overrides?.children,
              [path]: { ...e.overrides?.children?.[path], scripts: [...existing, scriptName] },
            },
          },
        };
      });
    },
    [updateEntity]
  );

  const removeChildOverrideScript = useCallback(
    (entityId: string, path: string, index: number) => {
      updateEntity(entityId, (e) => {
        const existing = e.overrides?.children?.[path]?.scripts ?? [];
        return {
          ...e,
          overrides: {
            ...e.overrides,
            children: {
              ...e.overrides?.children,
              [path]: { ...e.overrides?.children?.[path], scripts: existing.filter((_, i) => i !== index) },
            },
          },
        };
      });
    },
    [updateEntity]
  );

  const addScript = useCallback(
    (entityId: string, scriptName: string) => {
      updateEntity(entityId, (e) => ({
        ...e,
        scripts: [...(e.scripts ?? []), scriptName],
      }));
    },
    [updateEntity]
  );

  const removeScript = useCallback(
    (entityId: string, index: number) => {
      updateEntity(entityId, (e) => ({
        ...e,
        scripts: (e.scripts ?? []).filter((_, i) => i !== index),
      }));
    },
    [updateEntity]
  );

  const updatePrefabDraft = useCallback((updater: (p: PrefabData) => PrefabData) => {
    setPrefabDraft((prev) => {
      if (!prev) return prev;
      pushPrefabSnapshot(prev);
      return updater(prev);
    });
    setDirty(true);
  }, []);

  const updatePrefabComponentField = useCallback(
    (componentName: string, field: string, value: unknown) => {
      updatePrefabDraft((p) => ({
        ...p,
        components: {
          ...p.components,
          [componentName]: { ...p.components[componentName], [field]: value },
        },
      }));
    },
    [updatePrefabDraft]
  );

  const addPrefabComponent = useCallback(
    (componentName: string) => {
      const schema: ComponentDefinition | undefined = projectData?.components?.[componentName];
      if (!schema) return;

      const defaults = Object.fromEntries(
        schema.fields.map((f) => [
          f.key,
          f.type === "vector"
            ? { ...(f.defaultValue as Record<string, number>) }
            : f.defaultValue,
        ])
      );

      updatePrefabDraft((p) => ({
        ...p,
        components: { ...p.components, [componentName]: defaults },
      }));
    },
    [projectData, updatePrefabDraft]
  );

  const removePrefabComponent = useCallback(
    (componentName: string) => {
      updatePrefabDraft((p) => {
        const rest = { ...p.components };
        delete rest[componentName];
        return { ...p, components: rest };
      });
    },
    [updatePrefabDraft]
  );

  const addPrefabScript = useCallback(
    (scriptName: string) => {
      updatePrefabDraft((p) => ({ ...p, scripts: [...(p.scripts ?? []), scriptName] }));
    },
    [updatePrefabDraft]
  );

  const removePrefabScript = useCallback(
    (index: number) => {
      updatePrefabDraft((p) => ({ ...p, scripts: (p.scripts ?? []).filter((_, i) => i !== index) }));
    },
    [updatePrefabDraft]
  );

  const addPrefabChild = useCallback(
    (parentPath: string, childName: string) => {
      const trimmed = childName.trim();
      if (!trimmed) return;
      updatePrefabDraft((p) => {
        const children = getChildrenContainer(p, parentPath);
        if (children[trimmed]) return p; // name clash, no-op
        return setChildrenContainer(p, parentPath, {
          ...children,
          [trimmed]: { components: {}, scripts: [] },
        });
      });
    },
    [updatePrefabDraft]
  );

  const renamePrefabChild = useCallback(
    (parentPath: string, oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      updatePrefabDraft((p) => {
        const children = getChildrenContainer(p, parentPath);
        if (!children[oldName] || children[trimmed]) return p;
        const { [oldName]: node, ...rest } = children;
        return setChildrenContainer(p, parentPath, { ...rest, [trimmed]: node });
      });
    },
    [updatePrefabDraft]
  );

  const removePrefabChild = useCallback(
    (parentPath: string, childName: string) => {
      updatePrefabDraft((p) => {
        const children = { ...getChildrenContainer(p, parentPath) };
        delete children[childName];
        return setChildrenContainer(p, parentPath, children);
      });
    },
    [updatePrefabDraft]
  );

  const updatePrefabChildComponentField = useCallback(
    (path: string, componentName: string, field: string, value: unknown) => {
      updatePrefabDraft((p) =>
        updatePrefabChildNode(p, path, (node) => ({
          ...node,
          components: {
            ...node.components,
            [componentName]: { ...node.components[componentName], [field]: value },
          },
        }))
      );
    },
    [updatePrefabDraft]
  );

  const addPrefabChildComponent = useCallback(
    (path: string, componentName: string) => {
      const schema: ComponentDefinition | undefined = projectData?.components?.[componentName];
      if (!schema) return;

      const defaults = Object.fromEntries(
        schema.fields.map((f) => [
          f.key,
          f.type === "vector" ? { ...(f.defaultValue as Record<string, number>) } : f.defaultValue,
        ])
      );

      updatePrefabDraft((p) =>
        updatePrefabChildNode(p, path, (node) => ({
          ...node,
          components: { ...node.components, [componentName]: defaults },
        }))
      );
    },
    [projectData, updatePrefabDraft]
  );

  const removePrefabChildComponent = useCallback(
    (path: string, componentName: string) => {
      updatePrefabDraft((p) =>
        updatePrefabChildNode(p, path, (node) => {
          const rest = { ...node.components };
          delete rest[componentName];
          return { ...node, components: rest };
        })
      );
    },
    [updatePrefabDraft]
  );

  const addPrefabChildScript = useCallback(
    (path: string, scriptName: string) => {
      updatePrefabDraft((p) =>
        updatePrefabChildNode(p, path, (node) => ({
          ...node,
          scripts: [...(node.scripts ?? []), scriptName],
        }))
      );
    },
    [updatePrefabDraft]
  );

  const removePrefabChildScript = useCallback(
    (path: string, index: number) => {
      updatePrefabDraft((p) =>
        updatePrefabChildNode(p, path, (node) => ({
          ...node,
          scripts: (node.scripts ?? []).filter((_, i) => i !== index),
        }))
      );
    },
    [updatePrefabDraft]
  );

  const addEntity = useCallback(async (parentId: string | null = null) => {
    if (!scene || !target || target.kind === "prefab" || target.kind === "prefabChild") return;

    const existingIds = new Set(scene.entities.map((e) => e.id));

    const name = (await window.prompt("New entity name:"))?.trim();
    if (!name) return;
    if (existingIds.has(name)) {
      setError(`An entity named "${name}" already exists.`);
      return;
    }

    const newEntity: Entity = {
      id: name,
      components: { Transform: { x: 0, y: 0, rotation: 0 } },
      parentId: parentId ?? undefined,
    };
    pushSceneSnapshot(scene);
    setScene({ ...scene, entities: [...scene.entities, newEntity] });
    setDirty(true);
    // Jump straight to the new entity so it's ready to edit.
    setTarget({ kind: "entity", sceneId: target.sceneId, entityId: name });
  }, [scene, target]);

  // Deletes `entityId` AND its whole descendant subtree — mirrors the
  // engine's own Entity.destroy(), which cascades to children (see
  // source/engine/types/Entity.js) — otherwise orphaned children would be
  // left behind pointing at a parentId that no longer exists.
  const deleteEntity = useCallback((entityId: string) => {
    if (!scene) return;
    const removedIds = new Set(collectSubtree(scene.entities, entityId).map((e) => e.id));
    pushSceneSnapshot(scene);
    setScene({ ...scene, entities: scene.entities.filter((e) => !removedIds.has(e.id)) });
    setDirty(true);
    setTarget((prev) =>
      (prev?.kind === "entity" || prev?.kind === "instanceChild") && removedIds.has(prev.entityId)
        ? { kind: "scene", sceneId: prev.sceneId }
        : prev
    );
  }, [scene]);

  // Reparents `entityId` under `parentId` (or to top-level if null). Refuses
  // silently on a self-parent or a parent that's actually one of the
  // entity's own descendants — both would create a cycle that
  // getWorldTransform's ancestor walk would recurse into forever.
  //
  // Optionally also repositions the entity in the array relative to
  // `referenceId` (`"before"`/`"after"` it) — this is what lets a drag-drop
  // land as a specific sibling, not just "some child of this parent";
  // array order otherwise only affects tree/inspector display order, not
  // gameplay (draw order is Transform.zIndex, not array position).
  const setEntityParent = useCallback(
    (
      entityId: string,
      parentId: string | null,
      referenceId?: string,
      position?: "before" | "after"
    ) => {
      if (!scene || entityId === parentId) return;
      if (parentId && collectSubtree(scene.entities, entityId).some((e) => e.id === parentId)) return;

      let entities = scene.entities.map((e) =>
        e.id === entityId ? { ...e, parentId: parentId ?? undefined } : e
      );

      if (referenceId && position && referenceId !== entityId) {
        const moved = entities.find((e) => e.id === entityId);
        const rest = entities.filter((e) => e.id !== entityId);
        const refIndex = rest.findIndex((e) => e.id === referenceId);
        if (moved && refIndex !== -1) {
          rest.splice(position === "before" ? refIndex : refIndex + 1, 0, moved);
          entities = rest;
        }
      }

      pushSceneSnapshot(scene);
      setScene({ ...scene, entities });
      setDirty(true);
    },
    [scene]
  );

  // Clones entityId + its whole subtree as new siblings (same parent as the
  // original), with fresh ids and internal parent links remapped so the
  // duplicated hierarchy's shape matches the original.
  const duplicateEntity = useCallback((entityId: string) => {
    if (!scene || !target || target.kind === "prefab" || target.kind === "prefabChild") return;
    const entity = scene.entities.find((e) => e.id === entityId);
    if (!entity) return;

    const subtree = collectSubtree(scene.entities, entityId);
    const { entities: clones, newRootId } = cloneSubtreeWithNewIds(
      subtree,
      scene.entities,
      entity.parentId ?? null
    );

    pushSceneSnapshot(scene);
    setScene({ ...scene, entities: [...scene.entities, ...clones] });
    setDirty(true);
    setTarget({ kind: "entity", sceneId: target.sceneId, entityId: newRootId });
  }, [scene, target]);

  const copyEntity = useCallback((entityId: string) => {
    if (!scene) return;
    const subtree = collectSubtree(scene.entities, entityId);
    if (subtree.length) setEntityClipboard(structuredClone(subtree));
  }, [scene]);

  // Pastes the last copied subtree into the CURRENTLY open scene, optionally
  // under `parentId`. Works across scenes (copy in scene A, switch to scene
  // B, paste) since the clipboard is plain component state, not scoped to
  // one scene's entities array.
  const pasteEntity = useCallback((parentId: string | null = null) => {
    if (!scene || !target || target.kind === "prefab" || target.kind === "prefabChild" || !entityClipboard?.length) return;

    const { entities: clones, newRootId } = cloneSubtreeWithNewIds(
      entityClipboard,
      scene.entities,
      parentId
    );

    pushSceneSnapshot(scene);
    setScene({ ...scene, entities: [...scene.entities, ...clones] });
    setDirty(true);
    setTarget({ kind: "entity", sceneId: target.sceneId, entityId: newRootId });
  }, [scene, target, entityClipboard]);

  // Moves entityId + its subtree OUT of the currently open scene and INTO
  // targetSceneId, persisting both scenes immediately (unlike every other
  // mutator here, which only touches local draft state until save()) —
  // this crosses two files, so leaving it as unsaved local-only state would
  // risk losing the entity entirely if the tab closed mid-edit. `newParentId`
  // re-parents the moved root under an existing entity in the destination
  // scene (dropped "inside" it); omit/null to land top-level. Ids that
  // collide with what's already there get suffixed.
  const moveEntityToScene = useCallback(
    async (
      entityId: string,
      targetSceneId: string,
      onMoved?: () => void,
      newParentId: string | null = null
    ) => {
      if (!scene || !currentProject || !target || target.kind === "prefab" || target.kind === "prefabChild") return;
      if (targetSceneId === target.sceneId) return;

      const subtree = collectSubtree(scene.entities, entityId);
      if (!subtree.length) return;

      setSaving(true);
      setError(null);
      try {
        const { scene: targetScene } = await projectsApi.getScene(currentProject, targetSceneId);
        // Only honor newParentId if it actually exists in the destination
        // scene — a stale/unresolvable target just falls back to top-level
        // instead of producing a dangling parentId reference.
        const resolvedParentId =
          newParentId && targetScene.entities.some((e) => e.id === newParentId) ? newParentId : null;
        const { entities: movedEntities } = cloneSubtreeWithNewIds(
          subtree,
          targetScene.entities,
          resolvedParentId
        );

        await projectsApi.saveScene(currentProject, targetSceneId, {
          ...targetScene,
          entities: [...targetScene.entities, ...movedEntities],
        });

        const removedIds = new Set(subtree.map((e) => e.id));
        const nextSourceScene: Scene = {
          ...scene,
          entities: scene.entities.filter((e) => !removedIds.has(e.id)),
        };
        await projectsApi.saveScene(currentProject, target.sceneId, nextSourceScene);

        setScene(nextSourceScene);
        setDirty(false);
        setTarget((prev) =>
          (prev?.kind === "entity" || prev?.kind === "instanceChild") && removedIds.has(prev.entityId)
            ? { kind: "scene", sceneId: prev.sceneId }
            : prev
        );
        onMoved?.();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [scene, currentProject, target]
  );

  const save = useCallback(async () => {
    if (!currentProject || !target) return;
    setSaving(true);
    setError(null);
    try {
      if (target.kind === "prefab" || target.kind === "prefabChild") {
        if (!prefabDraft) return;
        await prefabsApi.save(currentProject, target.prefabName, prefabDraft);
        // Keep the read-only cache in sync so any entity currently showing
        // an Overrides panel for this prefab reflects the change right away.
        setPrefabCache((prev) => ({ ...prev, [target.prefabName]: prefabDraft }));
      } else {
        if (!scene) return;
        await projectsApi.saveScene(currentProject, target.sceneId, scene);
      }
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [scene, prefabDraft, currentProject, target]);

  const createComponent = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New component name:"))?.trim();
    if (!name) return;
    if (projectData?.components?.[name]) {
      setError(`A component named "${name}" already exists.`);
      return;
    }

    try {
      await componentsApi.create(currentProject, name);
      await reloadProject();
      setDirty(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, projectData, reloadProject]);

  const deleteComponent = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(
        `Delete component "${name}"? This does not remove it from entities/prefabs that already use it.`
      );
      if (!ok) return;

      try {
        await componentsApi.remove(currentProject, name);
        await reloadProject();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );

  const createScript = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New script name:"))?.trim();
    if (!name) return;

    try {
      await scriptsApi.create(currentProject, name);
      await reloadProject();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, reloadProject]);

  const deleteScript = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(
        `Delete script "${name}"? Entities/prefabs still referencing it by name will be left pointing at a missing file.`
      );
      if (!ok) return;

      try {
        await scriptsApi.remove(currentProject, name);
        await reloadProject();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );


  const createScene = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New scene name:"))?.trim();
    if (!name) return;

    try {
      await projectsApi.saveScene(currentProject, name, { name, entities: [] });
      await reloadProject();
      openScene(name);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, openScene, reloadProject]);

  const deleteScene = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(`Delete scene "${name}"? This cannot be undone.`);
      if (!ok) return;

      try {
        await scenesApi.remove(currentProject, name);
        await reloadProject();
        setTarget((prev) =>
          prev && prev.kind !== "prefab" && prev.kind !== "prefabChild" && prev.sceneId === name
            ? null
            : prev
        );
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );

  const setStartScene = useCallback(
    async (sceneId: string) => {
      if (!currentProject || sceneId === projectData?.project.startScene) return;
      try {
        await projectsApi.setStartScene(currentProject, sceneId);
        await reloadProject();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, projectData, reloadProject]
  );

  const createPrefab = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New prefab name:"))?.trim();
    if (!name) return;

    try {
      await prefabsApi.save(currentProject, name, { components: {}, scripts: [] });
      await reloadProject();
      openPrefab(name);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, openPrefab, reloadProject]);

  const deletePrefab = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(
        `Delete prefab "${name}"? Entities referencing it will keep their overrides but lose the base prefab.`
      );
      if (!ok) return;

      try {
        await prefabsApi.remove(currentProject, name);
        await reloadProject();
        setPrefabCache((prev) => {
          const rest = { ...prev };
          delete rest[name];
          return rest;
        });
        setTarget((prev) =>
          (prev?.kind === "prefab" || prev?.kind === "prefabChild") && prev.prefabName === name
            ? null
            : prev
        );
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );

  const createGraphScript = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New visual script name:"))?.trim();
    if (!name) return;

    try {
      await graphScriptsApi.create(currentProject, name);
      await reloadProject();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, reloadProject]);

  const deleteGraphScript = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(
        `Delete visual script "${name}"? Entities/prefabs still referencing it by name will be left pointing at a missing file.`
      );
      if (!ok) return;

      try {
        await graphScriptsApi.remove(currentProject, name);
        await reloadProject();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );

  const createAnimation = useCallback(async () => {
    if (!currentProject) return;
    const name = (await window.prompt("New animation clip name:"))?.trim();
    if (!name) return;
    if (projectData?.animations?.includes(`${name}.json`)) {
      setError(`An animation clip named "${name}" already exists.`);
      return;
    }

    try {
      await animationsApi.save(currentProject, name, { duration: 0.4, loop: false, tracks: {} });
      await reloadProject();
      setEditingClipName(name);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentProject, projectData, reloadProject]);

  const deleteAnimation = useCallback(
    async (name: string) => {
      if (!currentProject) return;

      const ok = await window.confirm(
        `Delete animation clip "${name}"? Any Animator still referencing it by name will fail to build.`
      );
      if (!ok) return;

      try {
        await animationsApi.remove(currentProject, name);
        await reloadProject();
        setEditingClipName((prev) => (prev === name ? null : prev));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
  );

  const targetIsPrefabFlavored = target?.kind === "prefab" || target?.kind === "prefabChild";

  const undo = useCallback(() => {
    if (targetIsPrefabFlavored) {
      const h = prefabHistoryRef.current;
      if (!h.past.length || !prefabDraft) return;
      h.future.push(structuredClone(prefabDraft));
      setPrefabDraft(h.past.pop()!);
    } else {
      const h = sceneHistoryRef.current;
      if (!h.past.length || !scene) return;
      h.future.push(structuredClone(scene));
      setScene(h.past.pop()!);
    }
    setDirty(true);
  }, [targetIsPrefabFlavored, scene, prefabDraft]);

  const redo = useCallback(() => {
    if (targetIsPrefabFlavored) {
      const h = prefabHistoryRef.current;
      if (!h.future.length || !prefabDraft) return;
      h.past.push(structuredClone(prefabDraft));
      setPrefabDraft(h.future.pop()!);
    } else {
      const h = sceneHistoryRef.current;
      if (!h.future.length || !scene) return;
      h.past.push(structuredClone(scene));
      setScene(h.future.pop()!);
    }
    setDirty(true);
  }, [targetIsPrefabFlavored, scene, prefabDraft]);

  const canUndo = targetIsPrefabFlavored
    ? prefabHistoryRef.current.past.length > 0
    : sceneHistoryRef.current.past.length > 0;
  const canRedo = targetIsPrefabFlavored
    ? prefabHistoryRef.current.future.length > 0
    : sceneHistoryRef.current.future.length > 0;

  return (
    <SceneEditorContext.Provider
      value={{
        target,
        scene,
        loading,
        error,
        dirty,
        saving,
        prefabCache,
        prefabDraft,
        openScene,
        openEntity,
        openPrefab,
        openPrefabChild,
        openInstanceChild,
        clear,
        renameEntity,
        updateComponentField,
        setComponentFields,
        addComponent,
        removeComponent,
        setEntityPrefab,
        updateOverrideField,
        setOverrideFields,
        resetOverrideComponent,
        addScript,
        removeScript,
        updatePrefabComponentField,
        addPrefabComponent,
        removePrefabComponent,
        addPrefabScript,
        removePrefabScript,
        addPrefabChild,
        renamePrefabChild,
        removePrefabChild,
        updatePrefabChildComponentField,
        addPrefabChildComponent,
        removePrefabChildComponent,
        addPrefabChildScript,
        removePrefabChildScript,
        updateChildOverrideField,
        resetChildOverrideComponent,
        addChildOverrideScript,
        removeChildOverrideScript,
        addEntity,
        deleteEntity,
        setEntityParent,
        duplicateEntity,
        entityClipboard,
        copyEntity,
        pasteEntity,
        moveEntityToScene,
        save,

        // need to make
        createComponent,
        deleteComponent,
        createScript,
        deleteScript,
        createGraphScript,
        deleteGraphScript,
        createScene,
        deleteScene,
        setStartScene,
        createPrefab,
        deletePrefab,
        createAnimation,
        deleteAnimation,
        editingClipName,
        openClipEditor,
        closeClipEditor,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </SceneEditorContext.Provider>
  );
}

export function useSceneEditor() {
  const ctx = useContext(SceneEditorContext);
  if (!ctx) throw new Error("useSceneEditor must be used within a SceneEditorProvider");
  return ctx;
}