import { useCallback, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { AssetEntry, texturesApi, type TextureNodeMetadata } from "../../api";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { GraphEditor, type GraphValue } from "./GraphEditor";
import { renderCompiledTexture } from "../../lib/texturePreview";



const texturePort = { id: "value", label: "Texture", dataType: "texture" };

// TODO: fetch these from backend too

const starter: GraphValue = {
  nodes: [
    { id: "color", type: "texture.color", position: { x: 80, y: 140 }, data: { values: { color: "#7c3aed" } } },
    { id: "output", type: "texture.output", position: { x: 500, y: 140 }, data: { values: {} } },
  ],
  edges: [{ id: "starter-color-output", source: "color", sourceHandle: "value", target: "output", targetHandle: "texture" }],
};

async function renderTexture(graph: GraphValue, assets: AssetEntry[], project: string, filename: string, size = 160): Promise<string> {
  return renderCompiledTexture(project, graph, assets, size);
}

const transparentPreview = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%2325202f'/%3E%3Cpath d='M30 30L130 130M130 30L30 130' stroke='%236b5b85' stroke-width='4'/%3E%3C/svg%3E";

export interface TextureGraphProps {
  open: boolean;
  onClose: () => void;
  project: string;
  filename: string;
  assets: AssetEntry[];
  initialValue?: GraphValue;
  onSave: (graph: GraphValue) => Promise<void> | void;
}

export default function TextureGraph({ open, onClose, project, filename, assets, initialValue, onSave }: TextureGraphProps) {
  const startingGraph = initialValue && initialValue.nodes.length > 0 ? initialValue : starter;
  const [graph, setGraph] = useState<GraphValue>(startingGraph);
  const [savedGraph, setSavedGraph] = useState<GraphValue>(startingGraph);
  const [preview, setPreview] = useState("");
  const [registry, setRegistry] = useState<Record<string, TextureNodeMetadata>>({});

  // textureapi.getNodeTypes() is a GET request, so we can safely call it in useEffect without worrying about stale closures.
  useEffect(() => {
    let cancelled = false;
    void texturesApi.getNodeTypes().then((types) => {
      if (!cancelled) {
        setRegistry(types as unknown as Record<string, TextureNodeMetadata>);
      }
    });
    return () => { cancelled = true; };
  }, []);


  const textureAssets = useMemo(() => assets.filter((asset) => asset.type === "image" || asset.type === "texture"), [assets]);
  const dirty = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedGraph),
    [graph, savedGraph],
  );

  const handleSave = useCallback(() => {
    onSave(graph);
    setSavedGraph(graph);
  }, [graph, onSave, preview]);

  useEffect(() => {
    let cancelled = false;
    void renderTexture(graph, assets, project, filename)
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
              <img
                src={preview}
                alt="Texture preview"
                className="w-full rounded border border-[var(--color-border)]"
                style={{ imageRendering: "pixelated" }}
                onError={() => setPreview(transparentPreview)}
              />
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
