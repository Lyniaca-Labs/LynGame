import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/board.
// Board data isn't a game asset, so it's stored via
// ctx.resolveProjectDataPath (under the project's .extensions/board/
// folder) instead of ctx.resolveProjectAssetPath (which writes into
// assets/, shown in the Explorer's Assets tab).
export function register(router, ctx) {
  function indexPath(project) {
    return ctx.resolveProjectDataPath(project, "board", "index.json");
  }

  function boardPath(project, id) {
    return ctx.resolveProjectDataPath(project, "board", `${id}.json`);
  }

  function readIndex(project) {
    const file = indexPath(project);
    if (!fs.existsSync(file)) return { boards: [] };
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return { boards: [] };
    }
  }

  function writeIndex(project, index) {
    fs.writeFileSync(indexPath(project), JSON.stringify(index, null, 2));
  }

  router.get("/list", (req, res) => {
    try {
      const project = String(req.query?.project ?? "");
      if (!project) return res.status(400).json({ success: false, error: "Missing project" });
      res.json({ success: true, boards: readIndex(project).boards });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/board", (req, res) => {
    try {
      const project = String(req.query?.project ?? "");
      const id = String(req.query?.id ?? "");
      if (!project || !id) return res.status(400).json({ success: false, error: "Missing project or id" });

      const file = boardPath(project, id);
      if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "Board not found" });

      let board;
      try {
        board = JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch {
        return res.status(404).json({ success: false, error: "Board data is corrupt" });
      }
      res.json({ success: true, board });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const board = req.body?.board;
      if (!project || !board?.id || !board?.name) {
        return res.status(400).json({ success: false, error: "Missing project or board" });
      }

      fs.writeFileSync(boardPath(project, board.id), JSON.stringify(board, null, 2));

      const index = readIndex(project);
      const entry = { id: board.id, name: board.name };
      const existingIndex = index.boards.findIndex((b) => b.id === board.id);
      if (existingIndex >= 0) index.boards[existingIndex] = entry;
      else index.boards.push(entry);
      writeIndex(project, index);

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/delete", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const id = String(req.body?.id ?? "");
      if (!project || !id) return res.status(400).json({ success: false, error: "Missing project or id" });

      const file = boardPath(project, id);
      if (fs.existsSync(file)) fs.unlinkSync(file);

      const index = readIndex(project);
      index.boards = index.boards.filter((b) => b.id !== id);
      writeIndex(project, index);

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
