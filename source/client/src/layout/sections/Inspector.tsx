import { Container } from "../../ui/Container";
import { useSceneEditor } from "../../context/SceneEditorContext";

export function Inspector() {
  const { target, scene, loading, error, updateComponentField } = useSceneEditor();

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

  return (
    <Container title={`Inspector — ${entity.id}`} bodyClassName="overflow-y-auto p-2">
      <div className="space-y-3">
        {Object.entries(entity.components).map(([componentName, fields]) => (
          <div key={componentName} className="rounded border border-[var(--color-border)] p-2">
            <div className="mb-2 text-xs font-medium text-[var(--color-text)]">{componentName}</div>
            <div className="space-y-1.5">
              {Object.entries(fields as Record<string, unknown>).map(([field, value]) => (
                <PropertyField
                  key={field}
                  label={field}
                  value={value}
                  onChange={(v) => updateComponentField(entity.id, componentName, field, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

function PropertyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const isColor = typeof value === "string" && /^#([0-9a-f]{3,8})$/i.test(value);

  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[var(--color-text-faint)]">{label}</span>
      {typeof value === "number" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
        />
      )}
      {typeof value === "boolean" && (
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      )}
      {typeof value === "string" && isColor && (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-8 rounded border border-[var(--color-border)] bg-transparent"
        />
      )}
      {typeof value === "string" && !isColor && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[var(--color-text)]"
        />
      )}
      {value !== null && typeof value === "object" && (
        <span className="italic text-[var(--color-text-faint)]">object</span>
      )}
    </label>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}