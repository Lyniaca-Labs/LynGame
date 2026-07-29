import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/pixel-art.
// `ctx` is the shared ExtensionContext (see ExtensionHandler.ts) — use it
// instead of touching the filesystem directly so path-traversal validation
// stays in one place instead of every extension reimplementing it.
export function register(router, ctx) {
  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      let filename = String(req.body?.filename ?? "").trim();
      const dataUrl = String(req.body?.dataUrl ?? "");

      if (!project || !filename) {
        return res.status(400).json({ success: false, error: "Missing project or filename" });
      }
      if (!filename.toLowerCase().endsWith(".png")) filename += ".png";
      if (!dataUrl.startsWith("data:image/png;base64,")) {
        return res.status(400).json({ success: false, error: "Expected a PNG data URL" });
      }

      const filePath = ctx.resolveProjectAssetPath(project, filename);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

      res.json({ success: true, filename });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
