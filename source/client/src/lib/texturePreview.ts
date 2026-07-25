import { AssetEntry, BASE_URL, projectsApi, texturesApi } from "../api";
import type { GraphValue } from "../components/graphs/GraphEditor";

type TextureSource = CanvasImageSource;

const rawAssetUrl = (project: string, relativePath: string) =>
  `${BASE_URL}/api/projects/${encodeURIComponent(project)}/assets/raw/${encodeURIComponent(relativePath)}`;

async function loadImage(project: string, asset: AssetEntry): Promise<HTMLImageElement> {
  const image = new Image();
  // The editor and API can run on different localhost origins/ports. Set
  // this before src so the response's CORS headers keep the canvas exportable.
  image.crossOrigin = "anonymous";
  image.src = rawAssetUrl(project, asset.relativePath);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load asset "${asset.relativePath}"`));
  });
  return image;
}

async function loadAsset(
  project: string,
  value: string,
  assets: AssetEntry[],
  loaded: Record<string, TextureSource>,
  cache: Map<string, Promise<TextureSource>>,
  visiting: Set<string>,
): Promise<TextureSource | undefined> {
  const asset = assets.find((candidate) => candidate.key === value || candidate.relativePath === value);
  if (!asset || visiting.has(asset.key)) return undefined;
  if (loaded[asset.key]) return loaded[asset.key];
  if (cache.has(asset.key)) return cache.get(asset.key);

  const promise = (async () => {
    visiting.add(asset.key);
    try {
      if (asset.type === "image") return await loadImage(project, asset);
      if (asset.type !== "texture") return undefined;

      const source = await projectsApi.readFile(project, "assets", asset.relativePath);
      const graph = (JSON.parse(source.content) as { graph?: GraphValue }).graph;
      if (!graph) return undefined;
      const compiled = await texturesApi.compile(project, asset.relativePath, graph);
      const moduleUrl = URL.createObjectURL(new Blob([compiled.code], { type: "text/javascript" }));
      try {
        const module = await import(/* @vite-ignore */ moduleUrl);
        const references = (graph.nodes ?? [])
          .filter((node) => node.type === "texture.asset")
          .map((node) => String(node.data?.values?.asset ?? ""))
          .filter(Boolean);
        for (const reference of references) {
          const input = await loadAsset(project, reference, assets, loaded, cache, visiting);
          const referenced = assets.find((candidate) => candidate.key === reference || candidate.relativePath === reference);
          if (input && referenced) loaded[referenced.key] = input;
        }
        return module.buildTexture({ size: 160, assets: loaded }) as TextureSource;
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    } finally {
      visiting.delete(asset.key);
    }
  })();
  cache.set(asset.key, promise);
  const result = await promise;
  if (result) loaded[asset.key] = result;
  return result;
}

export async function renderCompiledTexture(
  project: string,
  graph: GraphValue,
  assets: AssetEntry[],
  size = 160,
): Promise<string> {
  const loaded: Record<string, TextureSource> = {};
  const cache = new Map<string, Promise<TextureSource>>();
  const references = (graph.nodes ?? [])
    .filter((node) => node.type === "texture.asset")
    .map((node) => String(node.data?.values?.asset ?? ""))
    .filter(Boolean);
  for (const reference of references) await loadAsset(project, reference, assets, loaded, cache, new Set());

  const result = await texturesApi.compile(project, "preview.texture.json", graph);
  const moduleUrl = URL.createObjectURL(new Blob([result.code], { type: "text/javascript" }));
  try {
    const module = await import(/* @vite-ignore */ moduleUrl);
    const canvas = module.buildTexture({ size, assets: loaded }) as HTMLCanvasElement;
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}
