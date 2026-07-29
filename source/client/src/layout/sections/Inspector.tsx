// Inspector.tsx — full file

import { ReactNode, useEffect, useState } from "react";
import { Trash2, RefreshCw, X, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { Container } from "../../ui/Container";
import { Select, SelectOption } from "../../ui/Select";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { useProject } from "../../context/ProjectContext";
import { Entity, ComponentDefinition, ComponentFieldDefinition, PrefabData, PrefabChildData } from "../../api";
import type { GameViewHandle } from "../sections/GameView";
import { CodeStringEditorModal } from "../../components/CodeStringEditorModal";

type FieldType = ComponentFieldDefinition["type"];

const stripExt = (name: string) => name.replace(/\.(js|ts|json)$/i, "");

// Walks a prefab's `children` tree by dot-path — the same addressing scheme
// used everywhere else in this feature (overrides, Entity.getChild/query).
// Read-only lookup; SceneEditorContext has the mutating counterpart.
function resolvePrefabChildNode(
  root: PrefabData | PrefabChildData | undefined,
  path: string
): PrefabChildData | undefined {
  let node: PrefabData | PrefabChildData | undefined = root;
  for (const segment of path.split(".")) {
    node = node?.children?.[segment];
    if (!node) return undefined;
  }
  return node as PrefabChildData;
}

type InspectorProps = {
  onEdit?: () => void;
};

export function Inspector({ onEdit }: InspectorProps) {
  const {
    target,
    scene,
    loading,
    error,
    renameEntity,
    updateComponentField,
    addComponent,
    removeComponent,
    setEntityPrefab,
    updateOverrideField,
    resetOverrideComponent,
    prefabCache,
    addScript,
    removeScript,
    prefabDraft,
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
  } = useSceneEditor();
  const { projectData } = useProject();

  // Wrap any mutating handler so `onEdit` fires once, right after the
  // underlying change is applied — no need to thread `onEdit` through
  // every component/field prop individually.
  function withEdit<A extends unknown[]>(fn: (...args: A) => void) {
    return (...args: A) => {
      fn(...args);
      onEdit?.();
    };
  }

  if (!target) {
    return (
      <Container title="Inspector" description="Select a scene or entity to inspect it.">
        <PlaceholderPanel label="Nothing selected" />
      </Container>
    );
  }

  if (target.kind === "scene") {
    return (
      <Container title={`Inspector — ${target.sceneId}`}>
        <PlaceholderPanel label="Scene properties aren't editable yet" />
      </Container>
    );
  }

  const inspectingLabel =
    target.kind === "prefab"
      ? target.prefabName
      : target.kind === "prefabChild"
        ? `${target.prefabName} / ${target.path}`
        : target.kind === "instanceChild"
          ? `${target.entityId} / ${target.path}`
          : target.entityId;

  if (loading) {
    return (
      <Container title={`Inspector — ${inspectingLabel}`}>
        <PlaceholderPanel label="Loading…" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container title={`Inspector — ${inspectingLabel}`}>
        <PlaceholderPanel label={error} />
      </Container>
    );
  }

  if (target.kind === "prefab") {
    if (!prefabDraft) {
      return (
        <Container title={`Inspector — ${target.prefabName}`}>
          <PlaceholderPanel label="Prefab not found" />
        </Container>
      );
    }

    return (
      <InspectorPrefab
        prefabName={target.prefabName}
        prefab={prefabDraft}
        componentRegistry={projectData?.components ?? {}}
        scriptRegistry={projectData?.scripts ?? []}
        onFieldChange={withEdit(updatePrefabComponentField)}
        onAddComponent={withEdit(addPrefabComponent)}
        onRemoveComponent={withEdit(removePrefabComponent)}
        onAddScript={withEdit(addPrefabScript)}
        onRemoveScript={withEdit(removePrefabScript)}
      />
    );
  }

  if (target.kind === "prefabChild") {
    const node = prefabDraft ? resolvePrefabChildNode(prefabDraft, target.path) : undefined;
    if (!node) {
      return (
        <Container title={`Inspector — ${target.prefabName} / ${target.path}`}>
          <PlaceholderPanel label="Child not found" />
        </Container>
      );
    }

    return (
      <InspectorPrefabChild
        prefabName={target.prefabName}
        path={target.path}
        node={node}
        componentRegistry={projectData?.components ?? {}}
        scriptRegistry={projectData?.scripts ?? []}
        onAddChild={withEdit(addPrefabChild)}
        onRenameChild={withEdit(renamePrefabChild)}
        onRemoveChild={withEdit(removePrefabChild)}
        onFieldChange={withEdit(updatePrefabChildComponentField)}
        onAddComponent={withEdit(addPrefabChildComponent)}
        onRemoveComponent={withEdit(removePrefabChildComponent)}
        onAddScript={withEdit(addPrefabChildScript)}
        onRemoveScript={withEdit(removePrefabChildScript)}
      />
    );
  }

  if (target.kind === "instanceChild") {
    const entity = scene?.entities.find((e) => e.id === target.entityId);
    const prefabDef = entity?.prefab ? prefabCache[entity.prefab] : undefined;
    const node = resolvePrefabChildNode(prefabDef, target.path);

    if (!entity || !node) {
      return (
        <Container title={`Inspector — ${target.entityId} / ${target.path}`}>
          <PlaceholderPanel label={!entity ? "Entity not found" : "Loading prefab…"} />
        </Container>
      );
    }

    return (
      <InspectorInstanceChild
        entityId={entity.id}
        path={target.path}
        node={node}
        override={entity.overrides?.children?.[target.path]}
        componentRegistry={projectData?.components ?? {}}
        scriptRegistry={projectData?.scripts ?? []}
        onOverrideFieldChange={withEdit(updateChildOverrideField)}
        onResetOverride={withEdit(resetChildOverrideComponent)}
        onAddScript={withEdit(addChildOverrideScript)}
        onRemoveScript={withEdit(removeChildOverrideScript)}
      />
    );
  }

  // target.kind === "entity"
  const entity = scene?.entities.find((e) => e.id === target.entityId);

  if (!entity) {
    return (
      <Container title={`Inspector — ${target.entityId}`}>
        <PlaceholderPanel label="Entity not found" />
      </Container>
    );
  }

  const existingIds = new Set(scene?.entities.map((e) => e.id) ?? []);
  existingIds.delete(entity.id);

  const prefabOptions: SelectOption[] = (projectData?.prefabs ?? []).map((p) => {
    const name = stripExt(p);
    return { value: name, label: name };
  });

  return (
    <InspectorEntity
      entity={entity}
      existingIds={existingIds}
      componentRegistry={projectData?.components ?? {}}
      scriptRegistry={projectData?.scripts ?? []}
      prefabOptions={prefabOptions}
      prefabDef={entity.prefab ? prefabCache[entity.prefab] : undefined}
      onRename={withEdit((newId: string) => renameEntity(entity.id, newId))}
      onSetPrefab={withEdit((prefabName: string | null) => setEntityPrefab(entity.id, prefabName))}
      onFieldChange={withEdit(updateComponentField)}
      onAddComponent={withEdit(addComponent)}
      onRemoveComponent={withEdit(removeComponent)}
      onOverrideFieldChange={withEdit(updateOverrideField)}
      onResetOverride={withEdit(resetOverrideComponent)}
      onAddScript={withEdit(addScript)}
      onRemoveScript={withEdit(removeScript)}
    />
  );
}

function InspectorEntity({
  entity,
  existingIds,
  componentRegistry,
  scriptRegistry,
  prefabOptions,
  prefabDef,
  onRename,
  onSetPrefab,
  onFieldChange,
  onAddComponent,
  onRemoveComponent,
  onOverrideFieldChange,
  onResetOverride,
  onAddScript,
  onRemoveScript,
}: {
  entity: Entity;
  existingIds: Set<string>;
  componentRegistry: Record<string, ComponentDefinition>;
  scriptRegistry: string[];
  prefabOptions: SelectOption[];
  prefabDef: PrefabData | undefined;
  onRename: (newId: string) => void;
  onSetPrefab: (prefabName: string | null) => void;
  onFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onAddComponent: (entityId: string, componentName: string) => void;
  onRemoveComponent: (entityId: string, componentName: string) => void;
  onOverrideFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onResetOverride: (entityId: string, componentName: string) => void;
  onAddScript: (entityId: string, scriptName: string) => void;
  onRemoveScript: (entityId: string, index: number) => void;
}) {
  // Components already covered by the attached prefab go through Overrides
  // instead — they're excluded here so "Add component" only offers genuinely
  // new, entity-local components.
  const prefabComponentNames = new Set(
    entity.prefab && prefabDef ? Object.keys(prefabDef.components) : []
  );
  const usedComponents = new Set(Object.keys(entity.components ?? {}));
  const componentOptions: SelectOption[] = Object.keys(componentRegistry)
    .filter((name) => !usedComponents.has(name) && !prefabComponentNames.has(name))
    .map((name) => ({ value: name, label: name }));

  // Scripts can be attached more than once (your sample data has LogScript
  // twice on fallingBox), so this list isn't filtered by what's already added.
  const scriptOptions: SelectOption[] = Array.from(
    new Map(
      scriptRegistry
        .filter((s) => !s.endsWith(".lgscript.js"))
        .map((s) => {
          const name = stripExt(s);
          return [name, { value: name, label: name } as SelectOption];
        })
    ).values()
  );

  return (
    <Container title={`Inspector — ${entity.id}`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-4">
        <EntityIdField
          entity={entity}
          existingIds={existingIds}
          onRename={onRename}
          gameViewRef={window.gameViewRef as React.RefObject<GameViewHandle>}
        />

        <Section title="Prefab">
          {entity.prefab ? (
            <div className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs">
              <span className="text-[var(--color-text)]">{entity.prefab}</span>
              <button
                type="button"
                onClick={() => onSetPrefab(null)}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                aria-label="Detach from prefab"
                title="Detach from prefab"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ) : prefabOptions.length > 0 ? (
            <Select
              options={prefabOptions}
              onChange={(v: string) => onSetPrefab(v)}
              placeholder="Attach a prefab…"
              emptyMessage="No prefabs available"
            />
          ) : (
            <div className="text-xs italic text-[var(--color-text-faint)]">No prefabs available</div>
          )}
        </Section>

        {entity.prefab && (
          <Section title="Overrides">
            <OverridesSection
              entity={entity}
              prefabDef={prefabDef}
              componentRegistry={componentRegistry}
              onOverrideFieldChange={onOverrideFieldChange}
              onResetOverride={onResetOverride}
            />
          </Section>
        )}

        <Section title="Components">
          <div className="space-y-2">
            {Object.entries(entity.components ?? {}).map(([componentName, fields]) => (
              <ComponentPanel
                key={componentName}
                entityId={entity.id}
                componentName={componentName}
                schema={componentRegistry[componentName]}
                values={fields as Record<string, unknown>}
                componentRegistry={componentRegistry}
                onFieldChange={onFieldChange}
                onRemove={() => onRemoveComponent(entity.id, componentName)}
              />
            ))}
            {Object.keys(entity.components ?? {}).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">
                {entity.prefab ? "No additional components" : "No components"}
              </div>
            )}
          </div>
          {componentOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={componentOptions}
                onChange={(v: string) => onAddComponent(entity.id, v)}
                placeholder="Add component…"
                emptyMessage="No components available"
              />
            </div>
          )}
        </Section>

        <Section title="Scripts">
          <div className="space-y-1">
            {(entity.scripts ?? []).map((scriptName, i) => (
              <div
                key={`${scriptName}-${i}`}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--color-text)]">{scriptName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveScript(entity.id, i)}
                  className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                  aria-label={`Remove ${scriptName}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(entity.scripts ?? []).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No scripts</div>
            )}
          </div>
          {scriptOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={scriptOptions}
                onChange={(v: string) => onAddScript(entity.id, v)}
                placeholder="Add script…"
                emptyMessage="No scripts available"
              />
            </div>
          )}
        </Section>
      </div>
    </Container>
  );
}

function InspectorPrefab({
  prefabName,
  prefab,
  componentRegistry,
  scriptRegistry,
  onFieldChange,
  onAddComponent,
  onRemoveComponent,
  onAddScript,
  onRemoveScript,
}: {
  prefabName: string;
  prefab: PrefabData;
  componentRegistry: Record<string, ComponentDefinition>;
  scriptRegistry: string[];
  onFieldChange: (componentName: string, field: string, value: unknown) => void;
  onAddComponent: (componentName: string) => void;
  onRemoveComponent: (componentName: string) => void;
  onAddScript: (scriptName: string) => void;
  onRemoveScript: (index: number) => void;
}) {
  const usedComponents = new Set(Object.keys(prefab.components ?? {}));
  const componentOptions: SelectOption[] = Object.keys(componentRegistry)
    .filter((name) => !usedComponents.has(name))
    .map((name) => ({ value: name, label: name }));

  const scriptOptions: SelectOption[] = Array.from(
    new Map(
      scriptRegistry
        .filter((s) => !s.endsWith(".lgscript.js"))
        .map((s) => {
          const name = stripExt(s);
          return [name, { value: name, label: name } as SelectOption];
        })
    ).values()
  );

  return (
    <Container title={`Inspector — ${prefabName} (Prefab)`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-4">
        <Section title="Components">
          <div className="space-y-2">
            {Object.entries(prefab.components ?? {}).map(([componentName, fields]) => (
              <ComponentPanel
                key={componentName}
                entityId={prefabName}
                componentName={componentName}
                schema={componentRegistry[componentName]}
                values={fields as Record<string, unknown>}
                componentRegistry={componentRegistry}
                onFieldChange={(_entityId, cName, field, value) => onFieldChange(cName, field, value)}
                onRemove={() => onRemoveComponent(componentName)}
              />
            ))}
            {Object.keys(prefab.components ?? {}).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No components</div>
            )}
          </div>
          {componentOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={componentOptions}
                onChange={(v: string) => onAddComponent(v)}
                placeholder="Add component…"
                emptyMessage="No components available"
              />
            </div>
          )}
        </Section>

        <Section title="Scripts">
          <div className="space-y-1">
            {(prefab.scripts ?? []).map((scriptName, i) => (
              <div
                key={`${scriptName}-${i}`}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--color-text)]">{scriptName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveScript(i)}
                  className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                  aria-label={`Remove ${scriptName}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(prefab.scripts ?? []).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No scripts</div>
            )}
          </div>
          {scriptOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={scriptOptions}
                onChange={(v: string) => onAddScript(v)}
                placeholder="Add script…"
                emptyMessage="No scripts available"
              />
            </div>
          )}
        </Section>
      </div>
    </Container>
  );
}

// Structural authoring view for a single child WITHIN a prefab's own
// definition (e.g. editing Card's "icon" child directly) — same shape as
// InspectorPrefab above, just addressed by dot-`path` instead of the prefab
// root, and with its own nested children addable/renameable/removable.
function InspectorPrefabChild({
  prefabName,
  path,
  node,
  componentRegistry,
  scriptRegistry,
  onAddChild,
  onRenameChild,
  onRemoveChild,
  onFieldChange,
  onAddComponent,
  onRemoveComponent,
  onAddScript,
  onRemoveScript,
}: {
  prefabName: string;
  path: string;
  node: PrefabChildData;
  componentRegistry: Record<string, ComponentDefinition>;
  scriptRegistry: string[];
  onAddChild: (parentPath: string, childName: string) => void;
  onRenameChild: (parentPath: string, oldName: string, newName: string) => void;
  onRemoveChild: (parentPath: string, childName: string) => void;
  onFieldChange: (path: string, componentName: string, field: string, value: unknown) => void;
  onAddComponent: (path: string, componentName: string) => void;
  onRemoveComponent: (path: string, componentName: string) => void;
  onAddScript: (path: string, scriptName: string) => void;
  onRemoveScript: (path: string, index: number) => void;
}) {
  const lastDot = path.lastIndexOf(".");
  const childName = lastDot === -1 ? path : path.slice(lastDot + 1);
  const parentPath = lastDot === -1 ? "" : path.slice(0, lastDot);

  const usedComponents = new Set(Object.keys(node.components ?? {}));
  const componentOptions: SelectOption[] = Object.keys(componentRegistry)
    .filter((name) => !usedComponents.has(name))
    .map((name) => ({ value: name, label: name }));

  const scriptOptions: SelectOption[] = Array.from(
    new Map(
      scriptRegistry
        .filter((s) => !s.endsWith(".lgscript.js"))
        .map((s) => {
          const name = stripExt(s);
          return [name, { value: name, label: name } as SelectOption];
        })
    ).values()
  );

  const childNames = Object.keys(node.children ?? {});

  return (
    <Container title={`Inspector — ${prefabName} / ${path}`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-4">
        <Section title="Child Name">
          <input
            type="text"
            defaultValue={childName}
            key={path}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== childName) onRenameChild(parentPath, childName, next);
            }}
            className="w-full rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs text-[var(--color-text)]"
          />
        </Section>

        <Section title="Components">
          <div className="space-y-2">
            {Object.entries(node.components ?? {}).map(([componentName, fields]) => (
              <ComponentPanel
                key={componentName}
                entityId={path}
                componentName={componentName}
                schema={componentRegistry[componentName]}
                values={fields as Record<string, unknown>}
                componentRegistry={componentRegistry}
                onFieldChange={(_path, cName, field, value) => onFieldChange(path, cName, field, value)}
                onRemove={() => onRemoveComponent(path, componentName)}
              />
            ))}
            {Object.keys(node.components ?? {}).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No components</div>
            )}
          </div>
          {componentOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={componentOptions}
                onChange={(v: string) => onAddComponent(path, v)}
                placeholder="Add component…"
                emptyMessage="No components available"
              />
            </div>
          )}
        </Section>

        <Section title="Scripts">
          <div className="space-y-1">
            {(node.scripts ?? []).map((scriptName, i) => (
              <div
                key={`${scriptName}-${i}`}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--color-text)]">{scriptName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveScript(path, i)}
                  className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                  aria-label={`Remove ${scriptName}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(node.scripts ?? []).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No scripts</div>
            )}
          </div>
          {scriptOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={scriptOptions}
                onChange={(v: string) => onAddScript(path, v)}
                placeholder="Add script…"
                emptyMessage="No scripts available"
              />
            </div>
          )}
        </Section>

        <Section title="Children">
          <div className="space-y-1">
            {childNames.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--color-text)]">{name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveChild(path, name)}
                  className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                  aria-label={`Remove ${name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {childNames.length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No children</div>
            )}
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              onClick={async () => {
                const name = (await window.prompt("New child name:"))?.trim();
                if (name) onAddChild(path, name);
              }}
            >
              Add Child
            </Button>
          </div>
        </Section>
      </div>
    </Container>
  );
}

// Override-only view for a "ghost" child of a prefab INSTANCE — inherited
// from the prefab, editable per-field via overrides (same pattern as
// OverridesSection/OverrideComponentPanel for a prefab's root component
// overrides), plus additive-only extra scripts. No structural editing here
// by design: a ghost child always keeps the same components/shape as the
// prefab defines; only its field VALUES can diverge per instance.
function InspectorInstanceChild({
  entityId,
  path,
  node,
  override,
  componentRegistry,
  scriptRegistry,
  onOverrideFieldChange,
  onResetOverride,
  onAddScript,
  onRemoveScript,
}: {
  entityId: string;
  path: string;
  node: PrefabChildData;
  override: Record<string, unknown> | undefined;
  componentRegistry: Record<string, ComponentDefinition>;
  scriptRegistry: string[];
  onOverrideFieldChange: (entityId: string, path: string, componentName: string, field: string, value: unknown) => void;
  onResetOverride: (entityId: string, path: string, componentName: string) => void;
  onAddScript: (entityId: string, path: string, scriptName: string) => void;
  onRemoveScript: (entityId: string, path: string, index: number) => void;
}) {
  const componentNames = Object.keys(node.components ?? {});
  const extraScripts = (override?.scripts as string[] | undefined) ?? [];

  const scriptOptions: SelectOption[] = Array.from(
    new Map(
      scriptRegistry
        .filter((s) => !s.endsWith(".lgscript.js"))
        .map((s) => {
          const name = stripExt(s);
          return [name, { value: name, label: name } as SelectOption];
        })
    ).values()
  );

  return (
    <Container title={`Inspector — ${entityId} / ${path} (ghost)`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-4">
        <div className="rounded border border-dashed border-[var(--color-border)] px-2 py-1.5 text-[10px] text-[var(--color-text-faint)]">
          Inherited from the prefab. Override fields below to diverge just this instance — structure
          (components/children) always follows the prefab.
        </div>

        <Section title="Overrides">
          {componentNames.length === 0 ? (
            <div className="text-xs italic text-[var(--color-text-faint)]">This child has no components</div>
          ) : (
            <div className="space-y-2">
              {componentNames.map((componentName) => {
                const defaults = node.components[componentName];
                const overrideValues = override?.[componentName] as Record<string, unknown> | undefined;
                const merged = { ...defaults, ...overrideValues };
                const hasOverride = Boolean(overrideValues && Object.keys(overrideValues).length > 0);

                return (
                  <OverrideComponentPanel
                    key={componentName}
                    entityId={entityId}
                    componentName={componentName}
                    schema={componentRegistry[componentName]}
                    values={merged}
                    hasOverride={hasOverride}
                    componentRegistry={componentRegistry}
                    onFieldChange={(eId, cName, field, value) => onOverrideFieldChange(eId, path, cName, field, value)}
                    onReset={() => onResetOverride(entityId, path, componentName)}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Inherited Scripts">
          <div className="space-y-1">
            {(node.scripts ?? []).map((scriptName, i) => (
              <div
                key={`${scriptName}-${i}`}
                className="flex items-center rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-faint)]"
              >
                {scriptName}
              </div>
            ))}
            {(node.scripts ?? []).length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">None</div>
            )}
          </div>
        </Section>

        <Section title="Extra Scripts (this instance only)">
          <div className="space-y-1">
            {extraScripts.map((scriptName, i) => (
              <div
                key={`${scriptName}-${i}`}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--color-text)]">{scriptName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveScript(entityId, path, i)}
                  className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                  aria-label={`Remove ${scriptName}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {extraScripts.length === 0 && (
              <div className="text-xs italic text-[var(--color-text-faint)]">No extra scripts</div>
            )}
          </div>
          {scriptOptions.length > 0 && (
            <div className="mt-2">
              <Select
                options={scriptOptions}
                onChange={(v: string) => onAddScript(entityId, path, v)}
                placeholder="Add script…"
                emptyMessage="No scripts available"
              />
            </div>
          )}
        </Section>
      </div>
    </Container>
  );
}

function EntityIdField({
  entity,
  existingIds,
  onRename,
  gameViewRef,
}: {
  entity: Entity;
  existingIds: Set<string>;
  onRename: (newId: string) => void;
  gameViewRef: React.RefObject<GameViewHandle>;
}) {
  const [value, setValue] = useState(entity.id);

  useEffect(() => setValue(entity.id), [entity.id]);

  const trimmed = value.trim();
  const isDuplicate = trimmed !== entity.id && existingIds.has(trimmed);
  const isEmpty = trimmed.length === 0;

  const commit = () => {
    if (isEmpty || isDuplicate || trimmed === entity.id) {
      setValue(entity.id);
      return;
    }
    onRename(trimmed);
  };

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
        Entity ID
      </div>

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setValue(entity.id);
            }}
            className={`w-full rounded border bg-transparent px-1.5 py-1 text-xs text-[var(--color-text)] ${isDuplicate
                ? "border-[var(--color-danger)]"
                : "border-[var(--color-border)]"
              }`}
          />
        </div>

        <div className="w-20 shrink-0 aspect-square">
          <EntityPreview
            className="h-full w-full"
            entityId={entity.id}
            entity={entity}
            gameViewRef={gameViewRef}
          />
        </div>
      </div>

      {isDuplicate && (
        <div className="mt-1 text-[10px] text-[var(--color-danger)]">
          An entity with this ID already exists.
        </div>
      )}
    </div>
  );
}

function EntityPreview({
  className,
  entityId,
  entity,
  gameViewRef,
}: {
  className?: string;
  entityId: string;
  entity: Entity;
  gameViewRef: React.RefObject<GameViewHandle>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // bump this to force a refetch without changing entityId
  const [refreshKey, setRefreshKey] = useState(0);

  const entityVersion = JSON.stringify(entity); // crude but effective way to detect changes

  // A prefab-only edit (component/script changed on the prefab, not on
  // this entity directly) won't change `entity`'s own JSON, so listen
  // for the global "rebuild finished" signal too.
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener("entity-preview-refresh", handler);
    return () => window.removeEventListener("entity-preview-refresh", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setPreview(null);

    gameViewRef.current
      ?.getEntityPreview(entityId, {
        width: 96,
        height: 96,
        background: "#1a1a1a",
      })
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entityId, entityVersion, refreshKey, gameViewRef]);

  return (
    <div className={`relative mb-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] ${className ?? ""}`}>
      {loading && (
        <div className="h-full w-full animate-pulse bg-[var(--color-bg-elevated)]" />
      )}
      {!loading && preview && (
        <img src={preview} alt={entityId} className="h-full w-full object-contain" />
      )}
      {!loading && !preview && (
        <span className="text-[10px] text-[var(--color-text-faint)]">No preview</span>
      )}

      <button
        type="button"
        onClick={() => setRefreshKey((k) => k + 1)}
        title="Refresh preview"
        className="absolute right-1 top-1 rounded bg-black/40 p-1 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
      >
        <RefreshCw size={10} />
      </button>
    </div>
  );
}

function OverridesSection({
  entity,
  prefabDef,
  componentRegistry,
  onOverrideFieldChange,
  onResetOverride,
}: {
  entity: Entity;
  prefabDef: PrefabData | undefined;
  componentRegistry: Record<string, ComponentDefinition>;
  onOverrideFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onResetOverride: (entityId: string, componentName: string) => void;
}) {
  if (!prefabDef) {
    return <div className="text-xs italic text-[var(--color-text-faint)]">Loading prefab…</div>;
  }

  const componentNames = Object.keys(prefabDef.components);

  if (componentNames.length === 0) {
    return <div className="text-xs italic text-[var(--color-text-faint)]">Prefab has no components</div>;
  }

  return (
    <div className="space-y-2">
      {componentNames.map((componentName) => {
        const defaults = prefabDef.components[componentName];
        const overrideValues = entity.overrides?.[componentName];
        const merged = { ...defaults, ...overrideValues };
        const hasOverride = Boolean(overrideValues && Object.keys(overrideValues).length > 0);

        return (
          <OverrideComponentPanel
            key={componentName}
            entityId={entity.id}
            componentName={componentName}
            schema={componentRegistry[componentName]}
            values={merged}
            hasOverride={hasOverride}
            componentRegistry={componentRegistry}
            onFieldChange={onOverrideFieldChange}
            onReset={() => onResetOverride(entity.id, componentName)}
          />
        );
      })}
    </div>
  );
}

function OverrideComponentPanel({
  entityId,
  componentName,
  schema,
  values,
  hasOverride,
  componentRegistry,
  onFieldChange,
  onReset,
}: {
  entityId: string;
  componentName: string;
  schema?: ComponentDefinition;
  values: Record<string, unknown>;
  hasOverride: boolean;
  componentRegistry: Record<string, ComponentDefinition>;
  onFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onReset: () => void;
}) {
  const fieldDefs: ComponentFieldDefinition[] =
    schema?.fields ??
    Object.keys(values).map((key) => ({
      key,
      type: inferType(values[key]),
      defaultValue: values[key],
    }));

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className={collapsed ? "flex items-center justify-between" : "mb-2 flex items-center justify-between"}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {componentName}
          {hasOverride && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-secondary)]"
              title="Overridden"
            />
          )}
        </button>
        {hasOverride && (
          <button
            type="button"
            onClick={onReset}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
            aria-label={`Reset ${componentName} to prefab default`}
            title="Reset to prefab default"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-1.5">
          {fieldDefs.map((def) => (
            <SchemaField
              key={def.key}
              label={def.key}
              description={def.description}
              options={def.options}
              type={def.type}
              value={values[def.key] ?? def.defaultValue}
              componentRegistry={componentRegistry}
              onChange={(v) => onFieldChange(entityId, componentName, def.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ComponentPanel({
  entityId,
  componentName,
  schema,
  values,
  componentRegistry,
  onFieldChange,
  onRemove,
}: {
  entityId: string;
  componentName: string;
  schema?: ComponentDefinition;
  values: Record<string, unknown>;
  componentRegistry: Record<string, ComponentDefinition>;
  onFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onRemove: () => void;
}) {
  // Prefer the registry's declared fields/order. Fall back to inferring
  // from the instance data for components no longer in the registry
  // (e.g. removed from the project but still referenced in scene data).
  const fieldDefs: ComponentFieldDefinition[] =
    schema?.fields ??
    Object.keys(values).map((key) => ({
      key,
      type: inferType(values[key]),
      defaultValue: values[key],
    }));

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className={collapsed ? "flex items-center justify-between" : "mb-2 flex items-center justify-between"}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {componentName}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
          aria-label={`Remove ${componentName}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-1.5">
          {fieldDefs.map((def) => (
            <SchemaField
              key={def.key}
              options={def.options}
              label={def.key}
              type={def.type}
              description={def.description}
              value={values[def.key] ?? def.defaultValue}
              componentRegistry={componentRegistry}
              onChange={(v) => onFieldChange(entityId, componentName, def.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function inferType(value: unknown): FieldType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && /^#([0-9a-f]{3,8})$/i.test(value)) return "color";
  if (value !== null && typeof value === "object" && "x" in (value as object) && "y" in (value as object)) {
    return "vector";
  }
  return "text";
}

function FieldLabel({ label, description }: { label: string; description?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-text-faint)]">
      {label}
      {description && (
        <span
          title={description}
          className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center
                     rounded-full border border-current text-[9px] leading-none opacity-60 hover:opacity-100"
        >
          i
        </span>
      )}
    </span>
  );
}

function SchemaField({
  label,
  type,
  value,
  onChange,
  options,
  description,
  componentRegistry,
}: {
  label: string;
  type: FieldType;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: SelectOption[];
  description?: string;
  componentRegistry?: Record<string, ComponentDefinition>;
}) {
  const { scene } = useSceneEditor();

  if (type === "entity") {
    const datalistId = `entity-options-${label}`;
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <FieldLabel label={label} description={description} />
        <input
          type="text"
          list={datalistId}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="entity id or query path"
          className="w-40 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
        />
        <datalist id={datalistId}>
          {(scene?.entities ?? []).map((e) => (
            <option key={e.id} value={e.id} />
          ))}
        </datalist>
      </label>
    );
  }

  if (type === "animationRefs") {
    return (
      <div className="space-y-1">
        <FieldLabel label={label} description={description} />
        <AnimationRefsField value={(value as string[]) ?? []} onChange={onChange} />
      </div>
    );
  }

  if (type === "vector") {
    const vec = (value as { x?: number; y?: number }) ?? {};
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <FieldLabel label={label} description={description} />
        <div className="flex items-center gap-1.5">
          <VectorAxisInput axis="x" value={vec.x ?? 0} onChange={(v) => onChange({ ...vec, x: v })} />
          <VectorAxisInput axis="y" value={vec.y ?? 0} onChange={(v) => onChange({ ...vec, y: v })} />
        </div>
      </div>
    );
  }

  if (type === "select") {
    // console.log("Rendering select field", { label, value, options, type });
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <FieldLabel label={label} description={description} />
        <Select
          options={options ?? []}
          value={value as string}
          onChange={onChange}
          className="w-28"
          align="end"
        />
      </label>
    );
  }
  
  const SCOPE_BY_FIELD: Record<string, string[]> = {
    onClick: ["entity", "engine"],
    onHoverEnter: ["entity", "engine"],
    onHoverExit: ["entity", "engine"],
    onHold: ["entity", "engine"],
    onDragStart: ["entity", "engine", "data"],
    onDrag: ["entity", "engine", "data"],
    onDragEnd: ["entity", "engine", "data"],
    onCollide: ["entity", "other", "engine"],
  };

  if (type === "code") {
    const [editing, setEditing] = useState(false);
    const hasCode = typeof value === "string" && value.trim().length > 0;

    const handleClear = async () => {
      const ok = await confirm("Are you sure you want to clear this code? This action cannot be undone.");
      if (ok) onChange(null);
    };

    return (
      <>
        <label className="flex items-center justify-between gap-2 text-xs">
          <FieldLabel label={label} description={description} />
          <div className="flex items-center gap-1">
            {hasCode && (
              <Button
                variant="ghost"
                className="w-7 justify-center px-0"
                title={`Clear ${label}`}
                onClick={handleClear}
              >
                <X size={20} />
              </Button>
            )}
            <Button onClick={() => setEditing(true)} className="w-28 justify-center">
              {hasCode ? "Edit code" : "Add code"}
            </Button>
          </div>
        </label>

        <CodeStringEditorModal
          open={editing}
          value={hasCode ? (value as string) : ""}
          language="js"
          title={label}
          scopeVars={SCOPE_BY_FIELD[label] ?? ["entity", "engine"]}
          onSave={(next) => {
            const trimmed = next.trim();
            onChange(trimmed.length > 0 ? next : null);
          }}
          onClose={() => setEditing(false)}
        />
      </>
    );
  }

  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <FieldLabel label={label} description={description} />
      {type === "number" && (
        <input
          type="number"
          value={(value as number) ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
        />
      )}
      {type === "boolean" && (
        <Checkbox checked={Boolean(value)} onChange={(checked) => onChange(checked)} size="sm" />
      )}
      {type === "color" && (
        <input
          type="color"
          value={(value as string) ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-8 rounded border border-[var(--color-border)] bg-transparent"
        />
      )}
      {(type === "text" || type === "string") && (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const assetKey = e.dataTransfer.getData("text/lyngame-asset") || e.dataTransfer.getData("text/plain");
            if (assetKey) onChange(assetKey);
          }}
          className="w-28 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[var(--color-text)]"
        />
      )}
    </label>
  );
}

// Compact reference-list field for Animator.clips — the actual clip data now
// lives in project-level animation assets (edited via the dedicated
// AnimationClipEditorModal, opened from here or the Explorer's Animations
// section), so this just curates which clips show up for this entity.
function AnimationRefsField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { projectData, currentProject } = useProject();
  const { openClipEditor, createAnimation } = useSceneEditor();

  const clips = value ?? [];
  const stripJson = (name: string) => name.replace(/\.json$/i, "");
  const available = (projectData?.animations ?? []).map(stripJson);
  const options: SelectOption[] = available
    .filter((name) => !clips.includes(name))
    .map((name) => ({ value: name, label: name }));

  const addClip = (name: string) => {
    if (!name || clips.includes(name)) return;
    onChange([...clips, name]);
  };

  const removeClip = (name: string) => onChange(clips.filter((c) => c !== name));

  const handleNewClip = async () => {
    await createAnimation();
    // createAnimation() opens the new clip in the modal; the user still
    // needs to explicitly reference it here since a clip can be shared by
    // many entities and this list is per-entity curation.
  };

  return (
    <div className="space-y-1.5">
      {clips.length === 0 && <div className="text-xs italic text-[var(--color-text-faint)]">No clips</div>}
      {clips.map((name) => {
        const missing = currentProject && !available.includes(name);
        return (
          <div
            key={name}
            className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          >
            <span className={missing ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"}>
              {name}
              {missing && " (missing)"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openClipEditor(name)}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                aria-label={`Edit ${name}`}
                title="Edit clip"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => removeClip(name)}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                aria-label={`Remove ${name}`}
                title="Remove reference"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-1.5">
        {options.length > 0 && (
          <Select
            options={options}
            onChange={addClip}
            placeholder="+ Add clip…"
            emptyMessage="No more clips"
            className="flex-1"
          />
        )}
        <Button variant="ghost" onClick={handleNewClip} className="shrink-0">
          + New Clip
        </Button>
      </div>
    </div>
  );
}

function VectorAxisInput({
  axis,
  value,
  onChange,
}: {
  axis: "x" | "y";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[var(--color-text-faint)]">{axis}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-right text-[var(--color-text)]"
      />
    </div>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}
