import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useProject } from "./ProjectContext";
import { projectsApi, Scene, Entity, ComponentDefinition } from "../api";

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

  openScene: (sceneId: string) => void;
  openEntity: (sceneId: string, entityId: string) => void;
  clear: () => void;

  updateComponentField: (
    entityId: string,
    componentName: string,
    field: string,
    value: unknown
  ) => void;
  addComponent: (entityId: string, componentName: string) => void;
  removeComponent: (entityId: string, componentName: string) => void;

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
    setScene((prev) => {
      if (!prev) return prev;
      const id = `entity${prev.entities.length + 1}`;
      const newEntity: Entity = { id, components: { Transform: { x: 0, y: 0, rotation: 0 } } };
      return { ...prev, entities: [...prev.entities, newEntity] };
    });
    setDirty(true);
  }, []);

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
        openScene,
        openEntity,
        clear,
        updateComponentField,
        addComponent,
        removeComponent,
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