import { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Container } from "../../ui/Container";
import { Select,SelectOption } from "../../ui/Select";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { useProject } from "../../context/ProjectContext";
import { Entity, ComponentDefinition, ComponentFieldDefinition } from "../../api";

type FieldType = ComponentFieldDefinition["type"];

const stripExt = (name: string) => name.replace(/\.(js|ts)$/i, "");

export function Inspector() {
  const {
    target,
    scene,
    loading,
    error,
    updateComponentField,
    addComponent,
    removeComponent,
    addScript,
    removeScript,
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

  // target.kind === "entity"
  if (loading) {
    return (
      <Container title={`Inspector — ${target.entityId}`}>
        <PlaceholderPanel label="Loading…" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container title={`Inspector — ${target.entityId}`}>
        <PlaceholderPanel label={error} />
      </Container>
    );
  }

  const entity = scene?.entities.find((e) => e.id === target.entityId);

  if (!entity) {
    return (
      <Container title={`Inspector — ${target.entityId}`}>
        <PlaceholderPanel label="Entity not found" />
      </Container>
    );
  }

  if (entity.prefab) {
    return (
      <Container title={`Inspector — ${entity.id}`}>
        <PlaceholderPanel
          label={`Prefab instance (${entity.prefab}) — override editing isn't supported yet`}
        />
      </Container>
    );
  }

  return (
    <InspectorEntity
      entity={entity}
      componentRegistry={projectData?.components ?? {}}
      scriptRegistry={projectData?.scripts ?? []}
      onFieldChange={updateComponentField}
      onAddComponent={addComponent}
      onRemoveComponent={removeComponent}
      onAddScript={addScript}
      onRemoveScript={removeScript}
    />
  );
}

function InspectorEntity({
  entity,
  componentRegistry,
  scriptRegistry,
  onFieldChange,
  onAddComponent,
  onRemoveComponent,
  onAddScript,
  onRemoveScript,
}: {
  entity: Entity;
  componentRegistry: Record<string, ComponentDefinition>;
  scriptRegistry: string[];
  onFieldChange: (entityId: string, componentName: string, field: string, value: unknown) => void;
  onAddComponent: (entityId: string, componentName: string) => void;
  onRemoveComponent: (entityId: string, componentName: string) => void;
  onAddScript: (entityId: string, scriptName: string) => void;
  onRemoveScript: (entityId: string, index: number) => void;
}) {
  const usedComponents = new Set(Object.keys(entity.components ?? {}));
  const componentOptions: SelectOption[] = Object.keys(componentRegistry)
    .filter((name) => !usedComponents.has(name))
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
              <div className="text-xs italic text-[var(--color-text-faint)]">No components</div>
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