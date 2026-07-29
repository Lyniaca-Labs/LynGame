# Changelog 2

Autonomous session — 2026-07-29, continuing directly from changelog1.md.
Bug fixes first, then the extensions system. Everything below was
implemented without stopping for input, per request. Review before merging.

## Bug fixes

### `layoutEditOpen is not defined` crash
Grepped the whole client for `layoutEditOpen` — zero matches. That state
variable was fully replaced by `viewportTab` in the previous session, so
this was a stale Vite/HMR bundle from before that change finished landing,
not a real bug in current source. If it recurs, hard-refresh or restart the
dev server; nothing to fix here.

### Entity previews never loading in the Scene Canvas
**Files:** `source/client/src/layout/EditorLayout.tsx`,
`source/client/src/layout/sections/SceneCanvas.tsx`

Root cause: the Scene Canvas fetches every entity's thumbnail immediately
on mount — often *before* the project's very first auto-build has finished,
since that many concurrent requests are racing a build that just started.
Each fetch has its own internal retry loop (in `GameView.getEntityPreview`)
but only for ~5 seconds; if the first build was still slow, every box lost
that race and then had no reason to ever try again. The Inspector's preview
mostly dodged this by luck — you typically don't open an entity's Inspector
until well after the initial build finishes, and even it wasn't immune if
opened early enough.

Fix: `build()` in `EditorLayout.tsx` now dispatches the `entity-preview-refresh`
window event once *any* build (not just a post-save rebuild) actually lands,
and `SceneCanvas`'s `EntityBox` now listens for that event (mirroring the
Inspector's existing `EntityPreview`) and retries. Should also make the
Inspector's preview more consistently correct on a cold project open.

### "Center view" button didn't do anything
**File:** `source/client/src/layout/sections/SceneCanvas.tsx`

The button lived inside the canvas's background pan-handler region without
its own `stopPropagation()`. A click's `pointerdown` bubbled up to the
canvas root, which called `setPointerCapture()` on *itself* for that
pointer — and once an element captures a pointer, the browser's synthesized
`click` event gets redirected to the capturing element instead of the
original target, so the button's `onClick` never actually fired. Every
other interactive element in this file already knew to
`stopPropagation()` for exactly this reason (see the existing comment on
`handleBackgroundPointerDown`) — this one button was added afterward and
missed it. Fixed, and "Center view" now also resets zoom back to 100%.

### No way to zoom out in the Scene Canvas
**File:** `source/client/src/layout/sections/SceneCanvas.tsx`

Added scroll-wheel zoom (20%–400%, shown as a small badge next to Center
View), applied as `scale(zoom)` on the entity layer (composed after the pan
`translate`, so panning stays 1:1 with the mouse at any zoom level). Entity
drag math now divides screen-pixel movement by `zoom` so a dragged box stays
glued to the cursor instead of drifting at anything other than 100%.

### Prefab instances without a base Transform couldn't be positioned
**Files:** `source/client/src/context/SceneEditorContext.tsx`,
`source/client/src/layout/sections/SceneCanvas.tsx`

Two related gaps:
1. Any entity with no `Transform` anywhere in its effective components
   (plain or prefab-merged) was silently dropped from the canvas entirely —
   most commonly a prefab instance whose *prefab* never defined a Transform.
2. Even once shown, prefab instances write through *overrides*
   (`entity.overrides`), not plain `components` — the canvas was
   unconditionally calling `setComponentFields`/`addComponent`, which are
   the wrong pair of functions for a prefab instance and would have
   silently no-opped or written to the wrong place.

Fixed: entities without a Transform now still get a box at the origin
(dragging/nudging/pinning it creates the Transform on first use, in the
right place). Added `setOverrideFields` to `SceneEditorContext` (batch
version of the existing `updateOverrideField`, same reasoning as
`setComponentFields`) and a small `writeFields()`/`clearAnchor()` dispatch
in `SceneCanvas` that branches on `entity.prefab` so drag/nudge/pin/unpin
all write to the correct place for both plain entities and prefab
instances.

## Extensions system

**Design goal, from the request:** extensions live on the backend, can
expose their own HTTP endpoints, connect to a frontend, and keep running
under the existing Node server — with real flexibility in *where* they're
launched from and what kind of view they get, not just "one hardcoded
sprite editor bolted on."

### Architecture
An extension is a folder under `source/extensions/<name>/`:
```
source/extensions/<name>/
  manifest.json      — name, displayName, description, icon, activation[], view{}
  backend/index.js   — export function register(router, ctx) { router.get/post(...) }
  frontend/          — a normal static site (html/js/css), no build step required
```

- **Backend** (`source/server/manager/ExtensionHandler.ts`, wired into
  `index.ts` via `registerExtensions(app)`): at startup, scans
  `source/extensions/*`, dynamically `import()`s each `backend/index.js`
  and mounts its router at `/api/extensions/<name>/*`, serves
  `frontend/` as static files at `/extensions/<name>/*`, and exposes
  `GET /api/extensions` listing every manifest for the frontend picker. An
  extension gets an `ExtensionContext` (`resolveProjectAssetPath(project,
  filename)`) instead of touching the filesystem directly, so path-
  traversal validation lives in one place, not reimplemented per extension.
  A broken manifest or backend module is logged and skipped — one bad
  extension can't take the whole server down.
- **Frontend** (`source/client/src/components/ExtensionsModal.tsx`, opened
  from a new toolbar "Extensions" (🧩) button in `EditorLayout.tsx`): fetches
  `/api/extensions`, shows a picker grid, and hosts the chosen one's
  `frontend/` entry point in a **sandboxed iframe** (`sandbox="allow-scripts
  allow-same-origin allow-forms"`) — the same isolation pattern already used
  for the game/preview views, so an extension's own code never runs inside
  the editor's own document/React tree. The iframe gets `?project=<name>`
  in its URL so it knows which project it's operating on.

### Where the "flexibility" actually is (and isn't) right now
`manifest.json`'s `activation: string[]` and `view: { type, size, entry }`
are intentionally open-ended labels, not a closed enum enforced anywhere
critical:
- **Implemented today:** `activation: ["toolbar"]` (the picker button) and
  `view.type: "modal"` (full-screen-ish modal hosting the iframe, size from
  the manifest).
- **Deliberately not implemented yet, but the manifest shape already has
  room for it:** other activation points (an Explorer context-menu entry,
  an Inspector field action, a keyboard shortcut) and other view types (a
  persistent side panel instead of a modal, a floating window). An
  extension can declare `"activation": ["explorer-assets-menu"]` today —
  it just won't be reachable anywhere until a future frontend change reads
  that value. This was a deliberate scope cut: building every activation
  point speculatively, with only one real extension to validate the design
  against, risked guessing wrong and having to redo it.

### Example / first extension: Pixel Art Editor
**Files:** `source/extensions/pixel-art/`

- `manifest.json` — `activation: ["toolbar"]`, `view: { type: "modal",
  size: "lg", entry: "index.html" }`.
- `backend/index.js` — one route, `POST /api/extensions/pixel-art/save`:
  takes `{ project, filename, dataUrl }` (a PNG data URL), validates via
  `ctx.resolveProjectAssetPath`, and writes it straight into that project's
  `assets/` folder — "quickly saves to an asset," per the request, reusing
  the same folder the main asset importer already writes to (it shows up in
  the Explorer's Assets tab like anything else).
- `frontend/index.html` — a single self-contained page (no framework, no
  build step — vanilla canvas + JS): pick a grid size (8×8 to 48×48), paint
  with a palette or a custom color picker, erase (button-toggle or
  right-click), clear, then "Save to Assets" exports the grid at its native
  pixel resolution (not the zoomed-in display size) to a PNG and POSTs it.
  On success it `postMessage`s `{ type: "EXTENSION_ASSET_SAVED" }` to the
  parent window; `ExtensionsModal` listens for that and calls
  `reloadProject()`, so the new asset appears in the Explorer immediately
  without a manual refresh.

### Why iframe + static frontend instead of a real React extension API
The alternative — extensions registering actual React components/hooks
into the main app — would need either dynamically bundling arbitrary
third-party code into the Vite build (defeats "drop a folder in and it
works," needs a rebuild per extension) or a runtime module-federation setup
(real infrastructure, more failure modes, no existing precedent in this
codebase). The iframe approach costs isolation flexibility (an extension
can't casually reach into the editor's own React state) in exchange for:
zero build step for extension authors, a security boundary that's already
proven out in this codebase (the game/preview views work exactly this way),
and no risk of one broken extension's JS crashing the whole editor. Given
this is a v1 with exactly one real extension built against it, that trade
seemed right — worth revisiting once there's a second or third extension
that actually needs tighter integration.

### Verification
- `npx tsc --noEmit` clean in both `source/client` and `source/server`
  (client's one pre-existing unrelated error in `lib/texturePreview.ts`
  noted again, still not touched).
- `node --check` on both `source/engine/index.js` (bug-fix session — no
  engine changes this round, unaffected) and
  `source/extensions/pixel-art/backend/index.js`.
- **Not runtime-tested.** The user's dev server was already running live
  (that's how the bug reports came in) — starting a second instance would
  have killed it, since the server's startup calls `killPort()` on its
  configured port. `tsx watch` should pick up the new
  `ExtensionHandler.ts`/`index.ts` changes automatically on the existing
  running server; the extensions picker, the pixel-art editor end to end
  (draw → save → see it in Explorer), and all five bug fixes above still
  need an actual click-through before you trust them.
