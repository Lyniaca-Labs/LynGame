import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/spritesheet.
// `ctx` is the shared ExtensionContext — resolveProjectAssetPath writes into
// assets/ (so saved sheets/frames show up in the Explorer like any other
// asset), same as pixel-art's backend.
export function register(router, ctx) {
  function writePngDataUrl(project, filename, dataUrl) {
    if (!filename.toLowerCase().endsWith(".png")) filename += ".png";
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Expected a PNG data URL");
    }
    const filePath = ctx.resolveProjectAssetPath(project, filename);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return filename;
  }

  // Writes both the composited sheet image and its `.spritesheet.json`
  // sidecar in one call — the pair has to land together so ProjectHandler's
  // asset scan (which classifies a PNG as "spritesheet" only when the
  // sidecar is already sitting next to it) never sees one without the other.
  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const filenameInput = String(req.body?.filename ?? "").trim();
      const dataUrl = String(req.body?.dataUrl ?? "");
      const meta = req.body?.meta;

      if (!project || !filenameInput) {
        return res.status(400).json({ success: false, error: "Missing project or filename" });
      }
      if (!meta || typeof meta !== "object" || !Array.isArray(meta.frames)) {
        return res.status(400).json({ success: false, error: "Missing spritesheet metadata" });
      }

      const filename = writePngDataUrl(project, filenameInput, dataUrl);
      const jsonFilename = filename.replace(/\.png$/i, ".spritesheet.json");
      fs.writeFileSync(ctx.resolveProjectAssetPath(project, jsonFilename), JSON.stringify(meta, null, 2));

      res.json({ success: true, filename });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Writes a single cropped frame back out as its own plain image asset
  // ("split" — the reverse of composing several images into one sheet).
  router.post("/export-frame", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const filenameInput = String(req.body?.filename ?? "").trim();
      const dataUrl = String(req.body?.dataUrl ?? "");

      if (!project || !filenameInput) {
        return res.status(400).json({ success: false, error: "Missing project or filename" });
      }

      const filename = writePngDataUrl(project, filenameInput, dataUrl);
      res.json({ success: true, filename });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
