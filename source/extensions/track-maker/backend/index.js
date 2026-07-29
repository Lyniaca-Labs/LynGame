import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/track-maker.
// Mirrors sfx-generator's /save route — accepts a WAV data URL and writes it
// into the current project's assets folder via the shared ExtensionContext.
export function register(router, ctx) {
  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      let filename = String(req.body?.filename ?? "").trim();
      const dataUrl = String(req.body?.dataUrl ?? "");

      if (!project || !filename) {
        return res.status(400).json({ success: false, error: "Missing project or filename" });
      }
      if (!filename.toLowerCase().endsWith(".wav")) filename += ".wav";
      if (!dataUrl.startsWith("data:audio/wav;base64,")) {
        return res.status(400).json({ success: false, error: "Expected a WAV data URL" });
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
