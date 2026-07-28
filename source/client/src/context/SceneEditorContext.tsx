
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useProject } from "./ProjectContext";
import {
  projectsApi,
  prefabsApi,
  componentsApi,
  scriptsApi,
  scenesApi,
  Scene,
  Entity,
  ComponentDefinition,
  PrefabData,
  graphScriptsApi,
} from "../api";

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
  clear: () => void;

  renameEntity: (entityId: string, newId: string) => void;

  updateComponentField: (
    entityId: string,
    componentName: string,
    field: string,
    value: unknown
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
  resetOverrideComponent: (entityId: string, componentName: string) => void;

  addScript: (entityId: string, scriptName: string) => void;
  removeScript: (entityId: string, index: number) => void;

  // editing the prefab itself (target.kind === "prefab")
  updatePrefabComponentField: (componentName: string, field: string, value: unknown) => void;
  addPrefabComponent: (componentName: string) => void;
  removePrefabComponent: (componentName: string) => void;
  addPrefabScript: (scriptName: string) => void;
  removePrefabScript: (index: number) => void;

  addEntity: (parentId?: string | null) => void;
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
  createPrefab: () => Promise<void>;
  deletePrefab: (name: string) => Promise<void>;
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

  // Load the scene whenever the selected scene changes (regardless of
  // whether the target is the scene itself or an entity inside it).
  useEffect(() => {
    if (!target || target.kind === "prefab" || !currentProject) {
      setScene(null);
      return;
    }

    setLoading(true);
    setError(null);

    projectsApi
      .getScene(currentProject, target.sceneId)
      .then((res) => setScene(res.scene))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind === "prefab" ? null : target?.sceneId, currentProject]);

  // Load the prefab whenever a prefab becomes the inspector target. This is
  // a separate working copy from prefabCache so editing it doesn't fight
  // with the read-only snapshots used to compute overrides elsewhere.
  const prefabTargetName = target?.kind === "prefab" ? target.prefabName : null;

  useEffect(() => {
    if (!prefabTargetName || !currentProject) {
      setPrefabDraft(null);
      return;
    }

    setLoading(true);
    setError(null);

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
    if (!currentProject || !scene || target?.kind !== "entity") return;
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

  const openScene = useCallback((sceneId: string) => {
    setTarget({ kind: "scene", sceneId });
  }, []);

  const openEntity = useCallback((sceneId: string, entityId: string) => {
    setTarget({ kind: "entity", sceneId, entityId });
  }, []);

  const openPrefab = useCallback((prefabName: string) => {
    setTarget({ kind: "prefab", prefabName });
  }, []);

  const clear = useCallback(() => setTarget(null), []);

  const updateEntity = useCallback((entityId: string, updater: (e: Entity) => Entity) => {
    setScene((prev) => {
      if (!prev) return prev;
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
      return {
        ...prev,
        entities: prev.entities.map((e) => (e.id === entityId ? { ...e, id: trimmed } : e)),
      };
    });
    setDirty(true);
    setTarget((prev) =>
      prev?.kind === "entity" && prev.entityId === entityId ? { ...prev, entityId: trimmed } : prev
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
    setPrefabDraft((prev) => (prev ? updater(prev) : prev));
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

  const addEntity = useCallback((parentId: string | null = null) => {
    if (!scene || !target || target.kind === "prefab") return;

    const existingIds = new Set(scene.entities.map((e) => e.id));
    let n = scene.entities.length + 1;
    let id = `entity${n}`;
    while (existingIds.has(id)) {
      n += 1;
      id = `entity${n}`;
    }

    const newEntity: Entity = {
      id,
      components: { Transform: { x: 0, y: 0, rotation: 0 } },
      parentId: parentId ?? undefined,
    };
    setScene({ ...scene, entities: [...scene.entities, newEntity] });
    setDirty(true);
    // Jump straight to the new entity so it's ready to edit.
    setTarget({ kind: "entity", sceneId: target.sceneId, entityId: id });
  }, [scene, target]);

  // Deletes `entityId` AND its whole descendant subtree — mirrors the
  // engine's own Entity.destroy(), which cascades to children (see
  // source/engine/types/Entity.js) — otherwise orphaned children would be
  // left behind pointing at a parentId that no longer exists.
  const deleteEntity = useCallback((entityId: string) => {
    if (!scene) return;
    const removedIds = new Set(collectSubtree(scene.entities, entityId).map((e) => e.id));
    setScene({ ...scene, entities: scene.entities.filter((e) => !removedIds.has(e.id)) });
    setDirty(true);
    setTarget((prev) =>
      prev?.kind === "entity" && removedIds.has(prev.entityId) ? { kind: "scene", sceneId: prev.sceneId } : prev
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

      setScene({ ...scene, entities });
      setDirty(true);
    },
    [scene]
  );

  // Clones entityId + its whole subtree as new siblings (same parent as the
  // original), with fresh ids and internal parent links remapped so the
  // duplicated hierarchy's shape matches the original.
  const duplicateEntity = useCallback((entityId: string) => {
    if (!scene || !target || target.kind === "prefab") return;
    const entity = scene.entities.find((e) => e.id === entityId);
    if (!entity) return;

    const subtree = collectSubtree(scene.entities, entityId);
    const { entities: clones, newRootId } = cloneSubtreeWithNewIds(
      subtree,
      scene.entities,
      entity.parentId ?? null
    );

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
    if (!scene || !target || target.kind === "prefab" || !entityClipboard?.length) return;

    const { entities: clones, newRootId } = cloneSubtreeWithNewIds(
      entityClipboard,
      scene.entities,
      parentId
    );

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
      if (!scene || !currentProject || !target || target.kind === "prefab") return;
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
          prev?.kind === "entity" && removedIds.has(prev.entityId)
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
      if (target.kind === "prefab") {
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
        setTarget((prev) => (prev && prev.kind !== "prefab" && prev.sceneId === name ? null : prev));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentProject, reloadProject]
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
        setTarget((prev) => (prev?.kind === "prefab" && prev.prefabName === name ? null : prev));
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
        clear,
        renameEntity,
        updateComponentField,
        addComponent,
        removeComponent,
        setEntityPrefab,
        updateOverrideField,
        resetOverrideComponent,
        addScript,
        removeScript,
        updatePrefabComponentField,
        addPrefabComponent,
        removePrefabComponent,
        addPrefabScript,
        removePrefabScript,
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
        createPrefab,
        deletePrefab,
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