// components/AnimationClipEditorModal.tsx
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select, SelectOption } from "../ui/Select";
import { animationsApi, AnimatorClip, AnimatorTrack, AnimatorKeyframe, ComponentDefinition } from "../api";

const EASING_OPTIONS: SelectOption[] = [
  { value: "linear", label: "linear" },
  { value: "easeIn", label: "easeIn" },
  { value: "easeOut", label: "easeOut" },
  { value: "easeInOut", label: "easeInOut" },
];

const MODE_OPTIONS: SelectOption[] = [
  { value: "fixed", label: "fixed" },
  { value: "additive", label: "additive" },
];

const EMPTY_CLIP: AnimatorClip = { duration: 0.4, loop: false, tracks: {} };

function FieldLabel({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 text-[var(--color-text-faint)]">{label}</span>;
}

export function AnimationClipEditorModal({
  open,
  clipName,
  currentProject,
  componentRegistry,
  onClose,
}: {
  open: boolean;
  clipName: string | null;
  currentProject: string | null;
  componentRegistry: Record<string, ComponentDefinition>;
  onClose: () => void;
}) {
  const [clip, setClip] = useState<AnimatorClip | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clipName || !currentProject) {
      setClip(null);
      setDirty(false);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    animationsApi
      .get(currentProject, clipName)
      .then((data) => {
        if (!cancelled) {
          setClip({ ...EMPTY_CLIP, ...data });
          setDirty(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clipName, currentProject]);

  const componentOptions: SelectOption[] = Object.keys(componentRegistry).map((name) => ({
    value: name,
    label: name,
  }));

  const handleClose = () => onClose();

  const handleSave = async () => {
    if (!currentProject || !clipName || !clip) return;
    setSaving(true);
    try {
      await animationsApi.save(currentProject, clipName, clip);
      setDirty(false);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const snippet = clipName ? `entity.getComponent("Animator").play("${clipName}");` : "";
  const [copied, setCopied] = useState(false);
  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access can be denied — the snippet is still visible to copy by hand
    }
  };

  const updateClip = (next: AnimatorClip) => {
    setClip(next);
    setDirty(true);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="full"
      title={clipName ?? undefined}
      description="Animation clip — reusable across any entity's Animator component."
      confirmClose={dirty}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button variant="accent" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {loadError && <div className="p-3 text-xs text-[var(--color-danger)]">{loadError}</div>}
      {!loadError && !clip && <div className="p-3 text-xs text-[var(--color-text-faint)]">Loading…</div>}
      {clip && (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <FieldLabel label="duration (s)" />
              <input
                type="number"
                step={0.05}
                min={0.05}
                value={clip.duration}
                onChange={(e) => updateClip({ ...clip, duration: Math.max(Number(e.target.value), 0.01) })}
                className="w-20 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <FieldLabel label="loop" />
              <input
                type="checkbox"
                checked={Boolean(clip.loop)}
                onChange={(e) => updateClip({ ...clip, loop: e.target.checked })}
              />
            </label>
          </div>

          <ClipTracks
            clip={clip}
            componentOptions={componentOptions}
            onChange={updateClip}
          />

          <div className="rounded bg-[var(--color-bg-elevated)] p-2 max-w-md">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                Usage
              </span>
              <button
                type="button"
                onClick={copySnippet}
                className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto text-[10px] text-[var(--color-text)]">{snippet}</pre>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ClipTracks({
  clip,
  componentOptions,
  onChange,
}: {
  clip: AnimatorClip;
  componentOptions: SelectOption[];
  onChange: (next: AnimatorClip) => void;
}) {
  const trackEntries = Object.entries(clip.tracks ?? {});

  const addTrack = () => {
    let i = trackEntries.length + 1;
    let key = `track${i}`;
    while (clip.tracks?.[key]) {
      i += 1;
      key = `track${i}`;
    }
    onChange({
      ...clip,
      tracks: { ...clip.tracks, [key]: { target: "Transform", property: "", keyframes: [] } },
    });
  };

  const updateTrack = (key: string, next: AnimatorTrack) => {
    onChange({ ...clip, tracks: { ...clip.tracks, [key]: next } });
  };

  const removeTrack = (key: string) => {
    const rest = { ...clip.tracks };
    delete rest[key];
    onChange({ ...clip, tracks: rest });
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">Tracks</div>
      <div className="space-y-1.5">
        {trackEntries.map(([key, track]) => (
          <TrackEditor
            key={key}
            track={track}
            componentOptions={componentOptions}
            onChange={(next) => updateTrack(key, next)}
            onRemove={() => removeTrack(key)}
          />
        ))}
      </div>
      {trackEntries.length === 0 && (
        <div className="text-xs italic text-[var(--color-text-faint)]">No tracks yet</div>
      )}
      <Button variant="ghost" onClick={addTrack} className="w-full max-w-md justify-center">
        + Track
      </Button>
    </div>
  );
}

function TrackEditor({
  track,
  componentOptions,
  onChange,
  onRemove,
}: {
  track: AnimatorTrack;
  componentOptions: SelectOption[];
  onChange: (next: AnimatorTrack) => void;
  onRemove: () => void;
}) {
  const keyframes = [...(track.keyframes ?? [])].sort((a, b) => a.time - b.time);
  const stripRef = useRef<HTMLDivElement>(null);

  const timeFromClientX = (clientX: number) => {
    const el = stripRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const setKeyframes = (next: AnimatorKeyframe[]) => onChange({ ...track, keyframes: next });

  const addKeyframeAt = (time: number) => {
    const value = keyframes.length ? keyframes[keyframes.length - 1].value : 0;
    setKeyframes([...keyframes, { time, value }]);
  };

  const updateKeyframe = (index: number, next: AnimatorKeyframe) => {
    const nextKeyframes = keyframes.slice();
    nextKeyframes[index] = next;
    setKeyframes(nextKeyframes);
  };

  const removeKeyframe = (index: number) => setKeyframes(keyframes.filter((_, i) => i !== index));

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.keyframe) return;
    addKeyframeAt(timeFromClientX(e.clientX));
  };

  const handleMarkerPointerDown = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const t = timeFromClientX(ev.clientX);
      updateKeyframe(index, { ...keyframes[index], time: t });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="max-w-2xl rounded border border-[var(--color-border)] p-1.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Select
          options={componentOptions}
          value={track.target}
          onChange={(v) => onChange({ ...track, target: v })}
          className="w-32"
        />
        <input
          type="text"
          value={track.property}
          onChange={(e) => onChange({ ...track, property: e.target.value })}
          placeholder="property (e.g. y)"
          className="w-32 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--color-text)]"
        />
        <Select
          options={EASING_OPTIONS}
          value={track.easing ?? "linear"}
          onChange={(v) => onChange({ ...track, easing: v as AnimatorTrack["easing"] })}
          className="w-28"
        />
        <Select
          options={MODE_OPTIONS}
          value={track.mode ?? "fixed"}
          onChange={(v) => onChange({ ...track, mode: v as AnimatorTrack["mode"] })}
          className="w-24"
        />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
          aria-label="Remove track"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div
        ref={stripRef}
        onClick={handleStripClick}
        className="relative h-7 cursor-copy rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
        title="Click to add a keyframe"
      >
        {keyframes.map((kf, i) => (
          <div
            key={i}
            data-keyframe="true"
            onPointerDown={handleMarkerPointerDown(i)}
            style={{ left: `${kf.time * 100}%` }}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-[var(--color-bg-elevated)] bg-[var(--color-accent-secondary)]"
            title={`t=${(kf.time * 100).toFixed(0)}% value=${kf.value}`}
          />
        ))}
      </div>

      <div className="mt-1 space-y-1">
        {keyframes.map((kf, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px]">
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(kf.time * 100)}
              onChange={(e) =>
                updateKeyframe(i, { ...kf, time: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })
              }
              className="w-12 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-right text-[var(--color-text)]"
            />
            <span className="text-[var(--color-text-faint)]">%</span>
            <input
              type="number"
              value={kf.value}
              onChange={(e) => updateKeyframe(i, { ...kf, value: Number(e.target.value) })}
              className="w-16 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-right text-[var(--color-text)]"
            />
            <Select
              options={EASING_OPTIONS}
              value={kf.easing ?? ""}
              onChange={(v) => updateKeyframe(i, { ...kf, easing: (v || undefined) as AnimatorKeyframe["easing"] })}
              placeholder="(default)"
              className="w-24"
            />
            <button
              type="button"
              onClick={() => removeKeyframe(i)}
              className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
              aria-label="Remove keyframe"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
