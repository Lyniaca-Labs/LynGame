// Inspector.tsx — full file

import { ReactNode, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Container } from "../../ui/Container";
import { Select, SelectOption } from "../../ui/Select";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { useProject } from "../../context/ProjectContext";
import { Entity, ComponentDefinition, ComponentFieldDefinition, PrefabData } from "../../api";

type FieldType = ComponentFieldDefinition["type"];

const stripExt = (name: string) => name.replace(/\.(js|ts|json)$/i, "");

export function Inspector() {
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
  } = useSceneEditor();
  const { projectData } = useProject();

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

  const inspectingLabel = target.kind === "prefab" ? target.prefabName : target.entityId;

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
        onFieldChange={updatePrefabComponentField}
        onAddComponent={addPrefabComponent}
        onRemoveComponent={removePrefabComponent}
        onAddScript={addPrefabScript}
        onRemoveScript={removePrefabScript}
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
      onRename={(newId) => renameEntity(entity.id, newId)}
      onSetPrefab={(prefabName) => setEntityPrefab(entity.id, prefabName)}
      onFieldChange={updateComponentField}
      onAddComponent={addComponent}
      onRemoveComponent={removeComponent}
      onOverrideFieldChange={updateOverrideField}
      onResetOverride={resetOverrideComponent}
      onAddScript={addScript}
      onRemoveScript={removeScript}
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
  const scriptOptions: SelectOption[] = scriptRegistry.map((s) => {
    const name = stripExt(s);
    return { value: name, label: name };
  });

  return (
    <Container title={`Inspector — ${entity.id}`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-4">
        <EntityIdField entityId={entity.id} existingIds={existingIds} onRename={onRename} />

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

  const scriptOptions: SelectOption[] = scriptRegistry.map((s) => {
    const name = stripExt(s);
    return { value: name, label: name };
  });

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

function EntityIdField({
  entityId,
  existingIds,
  onRename,
}: {
  entityId: string;
  existingIds: Set<string>;
  onRename: (newId: string) => void;
}) {
  const [value, setValue] = useState(entityId);

  // Keep the field in sync if the selected entity changes out from under it
  // (e.g. selecting a different entity in the Explorer).
  useEffect(() => setValue(entityId), [entityId]);

  const trimmed = value.trim();
  const isDuplicate = trimmed !== entityId && existingIds.has(trimmed);
  const isEmpty = trimmed.length === 0;

  const commit = () => {
    if (isEmpty || isDuplicate || trimmed === entityId) {
      setValue(entityId);
      return;
    }
    onRename(trimmed);
  };

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
        Entity ID
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setValue(entityId);
        }}
        className={`w-full rounded border bg-transparent px-1.5 py-1 text-xs text-[var(--color-text)] ${isDuplicate ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
          }`}
      />
      {isDuplicate && (
        <div className="mt-0.5 text-[10px] text-[var(--color-danger)]">
          An entity with this ID already exists.
        </div>
      )}
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
  onFieldChange,
  onReset,
}: {
  entityId: string;
  componentName: string;
  schema?: ComponentDefinition;
  values: Record<string, unknown>;
  hasOverride: boolean;
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

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
          {componentName}
          {hasOverride && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-secondary)]"
              title="Overridden"
            />
          )}
        </span>
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
      <div className="space-y-1.5">
        {fieldDefs.map((def) => (
          <SchemaField
            key={def.key}
            label={def.key}
            type={def.type}
            value={values[def.key] ?? def.defaultValue}
            onChange={(v) => onFieldChange(entityId, componentName, def.key, v)}
          />
        ))}
      </div>
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
  onFieldChange,
  onRemove,
}: {
  entityId: string;
  componentName: string;
  schema?: ComponentDefinition;
  values: Record<string, unknown>;
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

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text)]">{componentName}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
          aria-label={`Remove ${componentName}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="space-y-1.5">
        {fieldDefs.map((def) => (
          <SchemaField
            key={def.key}
            label={def.key}
            type={def.type}
            value={values[def.key] ?? def.defaultValue}
            onChange={(v) => onFieldChange(entityId, componentName, def.key, v)}
          />
        ))}
      </div>
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

function SchemaField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: FieldType;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (type === "vector") {
    const vec = (value as { x?: number; y?: number }) ?? {};
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--color-text-faint)]">{label}</span>
        <div className="flex items-center gap-1.5">
          <VectorAxisInput axis="x" value={vec.x ?? 0} onChange={(v) => onChange({ ...vec, x: v })} />
          <VectorAxisInput axis="y" value={vec.y ?? 0} onChange={(v) => onChange({ ...vec, y: v })} />
        </div>
      </div>
    );
  }

  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[var(--color-text-faint)]">{label}</span>
      {type === "number" && (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
        />
      )}
      {type === "boolean" && (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      )}
      {type === "color" && (
        <input
          type="color"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-8 rounded border border-[var(--color-border)] bg-transparent"
        />
      )}
      {type === "text" && (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[var(--color-text)]"
        />
      )}
    </label>
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