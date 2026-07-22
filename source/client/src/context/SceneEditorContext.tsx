// SceneEditorContext.tsx — full file

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useProject } from "./ProjectContext";
import { projectsApi, prefabsApi, Scene, Entity, ComponentDefinition, PrefabData } from "../api";

export type InspectorTarget =
  | { kind: "scene"; sceneId: string }
  | { kind: "entity"; sceneId: string; entityId: string }
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

  openScene: (sceneId: string) => void;
  openEntity: (sceneId: string, entityId: string) => void;
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

  addEntity: () => void;
  deleteEntity: (entityId: string) => void;

  save: () => Promise<void>;
}

const SceneEditorContext = createContext<SceneEditorContextValue | null>(null);

export function SceneEditorProvider({ children }: { children: ReactNode }) {
  const { currentProject, projectData } = useProject();

  const [target, setTarget] = useState<InspectorTarget>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prefabCache, setPrefabCache] = useState<Record<string, PrefabData>>({});

  // Load the scene whenever the selected scene changes (regardless of
  // whether the target is the scene itself or an entity inside it).
  useEffect(() => {
    if (!target || !currentProject) {
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
  }, [target?.sceneId, currentProject]);

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

  const addEntity = useCallback(() => {
    if (!scene || !target) return;

    const existingIds = new Set(scene.entities.map((e) => e.id));
    let n = scene.entities.length + 1;
    let id = `entity${n}`;
    while (existingIds.has(id)) {
      n += 1;
      id = `entity${n}`;
    }

    const newEntity: Entity = { id, components: { Transform: { x: 0, y: 0, rotation: 0 } } };
    setScene({ ...scene, entities: [...scene.entities, newEntity] });
    setDirty(true);
    // Jump straight to the new entity so it's ready to edit.
    setTarget({ kind: "entity", sceneId: target.sceneId, entityId: id });
  }, [scene, target]);

  const deleteEntity = useCallback((entityId: string) => {
    setScene((prev) =>
      prev ? { ...prev, entities: prev.entities.filter((e) => e.id !== entityId) } : prev
    );
    setDirty(true);
    setTarget((prev) =>
      prev?.kind === "entity" && prev.entityId === entityId ? { kind: "scene", sceneId: prev.sceneId } : prev
    );
  }, []);

  const save = useCallback(async () => {
    if (!scene || !currentProject || !target) return;
    setSaving(true);
    setError(null);
    try {
      await projectsApi.saveScene(currentProject, target.sceneId, scene);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [scene, currentProject, target]);

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
        openScene,
        openEntity,
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
        addEntity,
        deleteEntity,
        save,
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