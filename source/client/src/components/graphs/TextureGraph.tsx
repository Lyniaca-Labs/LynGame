import { useCallback, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { AssetEntry, BASE_URL } from "../../api";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { GraphEditor, type GraphValue } from "./GraphEditor";

const texturePort = { id: "value", label: "Texture", dataType: "texture" };

const registry = {
  "texture.color": {
    type: "texture.color",
    label: "Solid Color",
    category: "Generators",
    color: "#a855f7",
    outputs: [texturePort],
    fields: [{ key: "color", type: "color" as const, defaultValue: "#7c3aed" }],
  },
  "texture.gradient": {
    type: "texture.gradient",
    label: "Gradient",
    category: "Generators",
    color: "#ec4899",
    outputs: [texturePort],
    fields: [
      { key: "direction", type: "select" as const, defaultValue: "horizontal", options: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }, { value: "diagonal", label: "Diagonal" }] },
      { key: "from", type: "color" as const, defaultValue: "#111827" },
      { key: "to", type: "color" as const, defaultValue: "#38bdf8" },
    ],
  },
  "texture.noise": {
    type: "texture.noise",
    label: "Noise",
    category: "Generators",
    color: "#f97316",
    outputs: [texturePort],
    fields: [
      { key: "seed", type: "number" as const, defaultValue: 1 },
      { key: "scale", type: "number" as const, defaultValue: 8, min: 1, max: 64 },
      { key: "colorA", type: "color" as const, defaultValue: "#111827" },
      { key: "colorB", type: "color" as const, defaultValue: "#f8fafc" },
    ],
  },
  "texture.checker": {
    type: "texture.checker",
    label: "Checker",
    category: "Generators",
    color: "#eab308",
    outputs: [texturePort],
    fields: [
      { key: "size", type: "number" as const, defaultValue: 16, min: 2, max: 64 },
      { key: "colorA", type: "color" as const, defaultValue: "#111827" },
      { key: "colorB", type: "color" as const, defaultValue: "#f8fafc" },
    ],
  },
  "texture.asset": {
    type: "texture.asset",
    label: "Existing Asset",
    category: "Inputs",
    color: "#22c55e",
    outputs: [texturePort],
    fields: [{ key: "asset", type: "text" as const, defaultValue: "" }],
  },
  "texture.blend": {
    type: "texture.blend",
    label: "Blend",
    category: "Filters",
    color: "#14b8a6",
    inputs: [{ id: "a", label: "A", dataType: "texture" }, { id: "b", label: "B", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number" as const, defaultValue: 0.5, min: 0, max: 1, step: 0.05 }],
  },
  "texture.invert": {
    type: "texture.invert",
    label: "Invert",
    category: "Filters",
    color: "#6366f1",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
  },
  "texture.brightness": {
    type: "texture.brightness",
    label: "Brightness",
    category: "Filters",
    color: "#0ea5e9",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number" as const, defaultValue: 1, min: 0, max: 2, step: 0.05 }],
  },
  "texture.output": {
    type: "texture.output",
    label: "Output",
    category: "Output",
    color: "#ef8fc8",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
  },
};

const starter: GraphValue = {
  nodes: [
    { id: "color", type: "texture.color", position: { x: 80, y: 140 }, data: { values: { color: "#7c3aed" } } },
    { id: "output", type: "texture.output", position: { x: 500, y: 140 }, data: { values: {} } },
  ],
  edges: [{ id: "starter-color-output", source: "color", sourceHandle: "value", target: "output", targetHandle: "texture" }],
};

function colorChannels(value: unknown): [number, number, number] {
  const hex = String(value ?? "#000000").replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const parsed = Number.parseInt(normalized, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function sourceEdge(graph: GraphValue, nodeId: string, handle: string) {
  const edges = graph.edges ?? [];
  return edges.find((edge) => edge.target === nodeId && edge.targetHandle === handle)?.source
    ?? edges.find((edge) => edge.target === nodeId)?.source;
}

async function renderTexture(graph: GraphValue, assets: AssetEntry[], project: string, size = 160): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;

  const paint = async (target: CanvasRenderingContext2D, nodeId: string | undefined): Promise<void> => {
    const node = (graph.nodes ?? []).find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const values = node.data.values ?? {};

    if (node.type === "texture.color") {
      target.fillStyle = String(values.color ?? "#7c3aed");
      target.fillRect(0, 0, size, size);
      return;
    }

    if (node.type === "texture.gradient") {
      const direction = String(values.direction ?? "horizontal");
      const gradient = direction === "vertical"
        ? target.createLinearGradient(0, 0, 0, size)
        : direction === "diagonal"
          ? target.createLinearGradient(0, 0, size, size)
          : target.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, String(values.from ?? "#111827"));
      gradient.addColorStop(1, String(values.to ?? "#38bdf8"));
      target.fillStyle = gradient;
      target.fillRect(0, 0, size, size);
      return;
    }

    if (node.type === "texture.checker") {
      const [a, b] = [colorChannels(values.colorA), colorChannels(values.colorB)];
      const tileSize = Math.max(2, Number(values.size ?? 16));
      const image = target.createImageData(size, size);
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const color = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 ? b : a;
        const index = (y * size + x) * 4;
        image.data.set([...color, 255], index);
      }
      target.putImageData(image, 0, 0);
      return;
    }

    if (node.type === "texture.noise") {
      const [a, b] = [colorChannels(values.colorA), colorChannels(values.colorB)];
      const seed = Number(values.seed ?? 1);
      const scale = Math.max(1, Number(values.scale ?? 8));
      const image = target.createImageData(size, size);
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const wave = Math.sin((x / scale + seed) * 12.9898 + (y / scale + seed) * 78.233) * 43758.5453;
        const amount = (wave - Math.floor(wave));
        const color = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
        const offset = (y * size + x) * 4;
        image.data.set([...color, 255], offset);
      }
      target.putImageData(image, 0, 0);
      return;
    }

    if (node.type === "texture.asset") {
      const asset = assets.find((candidate) => candidate.key === values.asset || candidate.relativePath === values.asset);
      if (!asset) return;
      const image = new Image();
      image.src = `${BASE_URL}/api/projects/${encodeURIComponent(project)}/assets/raw/${encodeURIComponent(asset.relativePath)}`;
      await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
      if (image.naturalWidth > 0) target.drawImage(image, 0, 0, size, size);
      return;
    }

    const input = async (handle: string) => {
      const source = sourceEdge(graph, node.id, handle);
      const layer = document.createElement("canvas");
      layer.width = size;
      layer.height = size;
      const layerContext = layer.getContext("2d")!;
      await paint(layerContext, source);
      return layer;
    };

    if (node.type === "texture.blend") {
      const first = await input("a");
      const second = await input("b");
      target.drawImage(first, 0, 0);
      target.globalAlpha = Number(values.amount ?? 0.5);
      target.drawImage(second, 0, 0);
      target.globalAlpha = 1;
      return;
    }

    if (node.type === "texture.invert" || node.type === "texture.brightness") {
      const layer = await input("texture");
      const pixels = layer.getContext("2d")!.getImageData(0, 0, size, size);
      const multiplier = node.type === "texture.invert" ? -1 : Number(values.amount ?? 1);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = node.type === "texture.invert" ? 255 - pixels.data[index] : Math.min(255, pixels.data[index] * multiplier);
        pixels.data[index + 1] = node.type === "texture.invert" ? 255 - pixels.data[index + 1] : Math.min(255, pixels.data[index + 1] * multiplier);
        pixels.data[index + 2] = node.type === "texture.invert" ? 255 - pixels.data[index + 2] : Math.min(255, pixels.data[index + 2] * multiplier);
      }
      target.putImageData(pixels, 0, 0);
    }
  };

  const nodes = graph.nodes ?? [];
  const output = nodes.find((node) => node.type === "texture.output");
  const connectedSource = output ? sourceEdge(graph, output.id, "texture") : undefined;
  const fallbackSource = [...nodes].reverse().find((node) => node.type !== "texture.output")?.id;
  const previewSource = connectedSource ?? fallbackSource;
  await paint(context, previewSource);

  // A graph without an Output connection should still produce a valid image
  // instead of leaving the preview element with an empty source.
  if (!previewSource) {
    context.fillStyle = "#25202f";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#6b5b85";
    context.lineWidth = 2;
    context.strokeRect(8, 8, size - 16, size - 16);
  }
  return canvas.toDataURL("image/png");
}

const transparentPreview = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%2325202f'/%3E%3Cpath d='M30 30L130 130M130 30L30 130' stroke='%236b5b85' stroke-width='4'/%3E%3C/svg%3E";

export interface TextureGraphProps {
  open: boolean;
  onClose: () => void;
  project: string;
  filename: string;
  assets: AssetEntry[];
  initialValue?: GraphValue;
  onSave: (graph: GraphValue, dataUrl: string) => Promise<void> | void;
}

export default function TextureGraph({ open, onClose, project, filename, assets, initialValue, onSave }: TextureGraphProps) {
  const startingGraph = initialValue && initialValue.nodes.length > 0 ? initialValue : starter;
  const [graph, setGraph] = useState<GraphValue>(startingGraph);
  const [savedGraph, setSavedGraph] = useState<GraphValue>(startingGraph);
  const [preview, setPreview] = useState("");
  const textureAssets = useMemo(() => assets.filter((asset) => asset.type === "image" || asset.type === "texture"), [assets]);
  const dirty = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedGraph),
    [graph, savedGraph],
  );

  const handleSave = useCallback(() => {
    onSave(graph, preview);
    setSavedGraph(graph);
  }, [graph, onSave, preview]);

  useEffect(() => {
    let cancelled = false;
    void renderTexture(graph, assets, project)
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      })
      .catch((error) => {
        console.error("Texture preview failed:", error);
        if (!cancelled) setPreview(transparentPreview);
      });
    return () => { cancelled = true; };
  }, [assets, graph, project]);

  return (
    <Modal
      confirmClose={dirty}
      open={open}
      onClose={onClose}
      title={filename}
      size="full"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
      footer={
        <Button
          variant="accent"
          onClick={handleSave}
          disabled={!dirty || !preview}
          title="Save texture graph (Ctrl/Cmd+S)"
        >
          <Save size={12} />
          Save
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <GraphEditor
            nodeTypes={registry}
            value={graph}
            onChange={setGraph}
            onSave={handleSave}
            emptyMessage="Use the + button to add a texture node."
          />
        </div>

        <div className="flex w-[260px] shrink-0 flex-col border-l border-[var(--color-border)]">
          <div className="flex shrink-0 items-center border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-xs font-semibold text-[var(--color-text)]">Preview</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {preview ? (
              <img src={preview} alt="Texture preview" className="w-full rounded border border-[var(--color-border)]" onError={() => setPreview(transparentPreview)} />
            ) : (
              <div className="text-xs text-[var(--color-text-faint)]">Connect a node to Output.</div>
            )}
            {textureAssets.length > 0 && (
              <div className="mt-3 text-[10px] text-[var(--color-text-faint)]">
                Asset inputs: {textureAssets.map((asset) => asset.key).join(", ")}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
