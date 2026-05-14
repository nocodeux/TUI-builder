# Game Builder — Open Questions, Proposed Decisions

**Status:** Draft proposal — pending approval
**Companion to:** `docs/GAME_BUILDER_PRD.md` §19
**Last Updated:** 2026-05-10

This document analyzes each open question from the Game Builder PRD and proposes a concrete decision with rationale, second-best alternative, and trigger condition for revisiting. Once approved, these resolutions will be folded into the PRD §19 table and the affected phase sections.

Q8 and Q9 are already locked in the PRD and not re-analyzed here.

---

## Q1 — Asset persistence model

**Question:** Should sprite sheets, tilesets, and sounds be stored inline in the project JSON, in a sidecar file, or via a separate asset endpoint?

### Evidence from current state
- A single existing project (`projects/b944ce4f-…json`) is already **1.5 MB** because it embeds base64 JPEGs and SVGs from the `Image` component.
- `localStorage` quota is ~5 MB shared across the entire origin. The current "mirror to localStorage" path (`nanostudio_current_project`) will fail silently on game projects.
- The save path is debounced 1s and POSTs the full JSON. Writing 10+ MB of base64 sprite data on every keystroke is wasteful.
- Project listing only needs metadata (`id`, `name`, `lastSaved`) — not assets.

### Options compared

| Option | Save speed | Quota risk | Implementation cost | Cache friendliness |
|---|---|---|---|---|
| Inline in project JSON | Slow (rewrites all assets every save) | High (localStorage 5MB) | Zero — works today | Poor (no per-asset cache) |
| **Sidecar `.assets.json`** | Fast (assets saved only when changed) | Low (filesystem, no quota) | Low (~50 LoC server + client split) | Good (sidecar can be cached separately) |
| Per-asset endpoint with hashing | Fastest after first save | None | High (content-addressed storage, dedupe) | Excellent |

### Proposed decision
**Sidecar file:** `projects/<id>.assets.json`. The main project JSON references assets by id only; the sidecar holds the base64 payloads.

**Save mechanics:**
- Editor tracks an `assetsDirty` flag separately from the existing project-dirty flag.
- Project JSON saves on every change (current behavior).
- Sidecar saves only when `assetsDirty === true`, debounced to 2s.
- New API endpoints: `GET /api/projects/:id/assets`, `POST /api/projects/:id/assets`.
- Project JSON load triggers sidecar load in parallel; UI renders skeleton placeholders while assets stream in.

**Why not per-asset endpoint with hashing:** dedupe and CDN-friendliness are real wins, but they cost a meaningful refactor for a single-user local tool. Worth doing if multi-user collaboration ever materializes — not now.

**Open sub-question (decide during Phase 2):** what to do when localStorage mirror is too large. Proposal: drop the assets from the localStorage mirror entirely (mirror only the schema), and re-fetch sidecar from the server on reload.

**Revisit when:** any project exceeds 50 MB of assets, or multi-user editing enters scope.

---

## Q2 — Lua VM choice

**Question:** wasmoon (Lua 5.4 WASM, ~250 KB) vs fengari (Lua 5.3 pure JS, ~140 KB) vs no Lua (sandboxed JS only)?

### Considerations
- Project README explicitly values "minimal surface area, fewer abstractions".
- Bundle size matters: the entire game runtime should aim for under 200 KB to feel proportionate to the editor.
- The PRD's `Trigger.runScript` and entity `scriptId` only need a sandboxed script-host with a curated API — the language is incidental.
- Game-dev cultural expectation around Lua exists but is not load-bearing for a browser-first builder.

### Options compared

| Option | Bundle cost | DX for the author | Runtime perf | Sandboxing risk |
|---|---|---|---|---|
| **JS sandboxed via `new Function`** | 0 KB | High (familiar syntax, no new docs) | Native | Real but bounded — see mitigations |
| fengari (Lua 5.3 in JS) | ~140 KB | Lua syntax, dynamic scoping | 10–50× slower than native JS | Same |
| wasmoon (Lua 5.4 WASM) | ~250 KB + WASM init | Modern Lua, FFI | Near-native after warmup | Same |

### Proposed decision
**Phase 6 ships JS-only scripting.** The script body is a string. Execution wraps it in `new Function('host', body)` and invokes with a frozen `host` object exposing the curated API (`getPlayer`, `setBehavior`, `damage`, `setFlag`, etc.).

**Sandboxing approach:**
- Script source is stripped of `import`, `require`, `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function`, `globalThis`, `window`, `document` references with a regex pre-pass *and* the function is invoked with a `with(undefined)` shim to deny global lookup. (This is not security against a hostile author — game scripts are authored by the project owner. It's protection against accidental footguns.)
- Per-script execution timeout enforced via a step counter injected into loops (acceptable since scripts are short event handlers, not long-running).

**If demand for Lua surfaces:** revisit with **wasmoon**, not fengari. The 110 KB delta over fengari buys 10× perf and modern Lua semantics.

**Revisit when:** a real authoring user explicitly asks for Lua, or scripts grow beyond ~200 lines and JS DX becomes the bottleneck.

**PRD impact:** §9 should be reframed from "Lua scripting" to "Scripting (JS)" with a note that Lua is a deferred option.

---

## Q3 — Physics library

**Question:** Custom AABB vs Planck.js (~150 KB) vs Matter.js (~80 KB)?

### What our games actually need
The PRD genres are: 2D Platformer, Top-Down RPG, Isometric, Board, Card, Arcade. None of these require:
- Rotational dynamics
- Constraints / joints
- Soft bodies
- Continuous collision detection for fast bullets

All of them need:
- Axis-aligned bounding box collision
- Tile-grid collision (a special case of AABB)
- Optional gravity + jump arc
- One-way platforms (platformer only)

### Options compared

| Option | Bundle cost | Genre fit | Determinism | Implementation cost |
|---|---|---|---|---|
| **Custom AABB + tile collision** | ~3 KB | Excellent for top-down/platformer/board/arcade | Trivially deterministic | Medium (~300 LoC) |
| Matter.js | ~80 KB | Overshoots; rotational solver not needed | Deterministic with fixed timestep | Low (off-the-shelf) |
| Planck.js | ~150 KB | Massively overshoots | Deterministic | Low |

### Proposed decision
**Custom AABB + swept tile collision** for v1. Implementation outline:
- Each entity has an AABB derived from sprite frame hitbox.
- Per-tick: integrate velocity, sweep along X then Y (separating axes), resolve against (a) other entity AABBs and (b) the active TileMap's collision layer.
- One-way platforms: collision only resolves when entity's previous Y was above the platform.
- Gravity is a per-Level scalar applied to entities flagged `affectedByGravity`.

**If a real game needs joints / rope physics / constraint solvers:** add Planck.js as an opt-in per-Level setting (`physicsEngine: 'aabb' | 'planck'`). Don't bring Matter.js — its solver is the weakest of the three and the API split would be hard to justify alongside Planck.

**Revisit when:** an author requests rotational physics, ragdoll, or rope/chain mechanics.

---

## Q4 — Coordinate-system isolation

**Question:** Confirm that absolute pixel positioning lives only inside Level rendering and never leaks into Screen authoring.

### Concrete contract
- The Canvas component branches early on render:
  ```js
  if (gameMode && currentLevelId) return <LevelCanvas .../>;
  return <RowsCanvas .../>;  // existing behavior
  ```
- `LevelCanvas` is a new file (`src/components/LevelCanvas.jsx`). It does NOT import or use `LayoutRow`, `DraggableComponent`, or any of the existing flexbox-row machinery.
- Level entities have `position: { x, y }` as their sole positioning fields. They have **no** `sizing.widthMode`, **no** `layout.direction`, **no** parent `Row`.
- The reverse boundary: a `GameView` component (which embeds a Level inside a Screen) sits *inside* the row-based layout exactly like any other component — it occupies a flexbox cell, and the absolute coordinate system lives strictly inside its own render boundary.

### Proposed decision
**Confirmed and codified.** Add an architectural test (see §Q5 below for testing approach): a lint-level check that `LevelCanvas.jsx` does not import `LayoutRow` and that `GameEntity.jsx` does not reference `sizing` or `layout` props.

**Revisit when:** never. If this boundary breaks, both systems will be in pain — keep the wall.

---

## Q5 — TileMap rendering performance

**Question:** Painting/displaying thousands of tiles in React DOM is slow. Use `<canvas>`?

### Math
- A modest 30×17 platformer screen = 510 tiles.
- A larger top-down level = 100×100 = 10,000 tiles.
- Each React-DOM tile would be a `<div>` with style. React reconciliation on a 10k-element tree on every paint stroke = unusable.

### Proposed decision
**`<canvas>`-based TileMap from day 1.**

Implementation outline:
- `TileMap.jsx` returns `<canvas ref={canvasRef} onPointerDown={...} onPointerMove={...} />`.
- Internal `useEffect` redraws the canvas whenever the tile-data prop changes.
- Tileset (the source PNG containing all tile graphics) is loaded once into an `Image` and `drawImage(tileset, srcX, srcY, …, dstX, dstY, …)` is called per visible tile.
- Viewport culling: only redraw tiles intersecting the visible canvas rect.
- Selection / paint coords: mouse XY → divide by `tileWidth` / `tileHeight` → grid coord → mutate tile-data array.
- Optional optimization (defer until needed): an off-screen canvas as a "baked" background layer that only re-renders when tiles change, with a separate overlay canvas for the live cursor. Skip in v1.

**Author UX:**
- Toolbox-like palette panel below the Inspector when a TileMap is selected, showing each tile from the tileset as a clickable swatch.
- Selected tile is the "brush". Click or click-drag on the canvas paints.
- Erase mode is a special "tile 0" brush.
- Layer selector (background / collision / spawn / overlay) sits above the palette.

### Architectural test idea (also serves Q4)
Add a tiny script `scripts/check-architecture.js` (Node, no deps) that greps the codebase for forbidden patterns and exits non-zero. Wired into a pre-commit hook (with the user's existing settings) as a soft gate. Patterns:
- `LevelCanvas.jsx` must not contain `import.*LayoutRow`.
- `GameEntity.jsx` must not reference `widthMode|heightMode|paddingLinked`.
- Existing `Componentes/*.jsx` files (the 23 pre-existing ones) must show zero git diff vs `main` until phase 5 explicitly opens them.

**Revisit when:** profiling shows TileMap redraw exceeds 16 ms on a 200×200 map — at that point, swap in the off-screen baked-canvas optimization.

---

## Q6 — Undo/redo for tile painting

**Question:** Tile painting fires many updates per stroke. The existing per-state-change history would make undo unusable.

### Proposed decision
**Stroke coalescing.**

- `pointerdown` on TileMap → snapshot current tile-data array, set `isStroking = true`.
- `pointermove` while stroking → mutate tile-data in place (NOT pushed to history). Trigger redraw only.
- `pointerup` → push a single history entry `{ kind: 'tilePaint', levelId, layerId, before: <snapshot>, after: <currentArray> }`, clear `isStroking`.
- Undo restores `before`; redo restores `after`. Memory cost: one full layer copy per stroke (acceptable; a 10k tile layer at 1 byte per tile is 10 KB).

**Storage optimization (defer):** if memory becomes an issue, store only diffs (`{ index, oldValue, newValue }[]`) instead of full snapshots. Skip in v1.

**Generalization:** the same coalescing pattern will be needed for any future drag-driven editing (e.g., dragging a GameEntity around the Level). Build the helper as a reusable `useCoalescedHistory` hook.

**Revisit when:** stroke memory exceeds 1 MB per history entry, or the user reports laggy undo.

---

## Q7 — Embedded game lifecycle

**Question:** When a Screen with a `GameView` is exited, does the game pause, reset, or persist state?

### Use cases to support
- **Portfolio with a mini-game** — author wants the game to start fresh each visit.
- **Multi-screen application with a game tab** — user navigates away briefly, expects to come back to the same state.
- **Save-game-driven adventure** — explicit save/load via `game_progress` table.

A single fixed semantic doesn't fit all three.

### Proposed decision
**Per-`GameView` configurable behavior.**

Add a prop on `GameView`:
```js
GameView: {
  worldId: null,
  onExit: 'pause',   // 'pause' | 'reset' | 'persist'
  autoStart: true,
  showControls: true,
  sizing: { widthMode: 'fill', heightMode: 'fixed' }
}
```

Semantics:
- `pause`: runtime keeps state in memory, freezes the tick loop, audio mutes. Re-entering resumes seamlessly. State is lost on page reload.
- `reset`: runtime is destroyed on exit. Re-entering starts fresh from spawn.
- `persist`: on exit, runtime serializes flags + inventory + position to `game_progress` table (slot 0 by default, configurable). Re-entering hydrates from that row.

**Default:** `pause` — least surprising for inline embeds.

**Memory bound on `pause`:** if the user navigates between many GameViews each set to pause, runtimes accumulate. Cap to 3 paused runtimes; LRU-evict to `reset` semantics beyond that. Document the cap.

**Revisit when:** the cap is hit in practice, or `persist` save data outgrows reasonable cell sizes (>100 KB per slot).

---

## Decision summary table (for folding into PRD §19)

| # | Question | Resolution |
|---|---|---|
| Q1 | Asset persistence | **Sidecar file** `projects/<id>.assets.json` with separate save endpoint and dirty flag. |
| Q2 | Scripting language | **JS sandboxed via `new Function`** in v1; revisit Lua (wasmoon) only on real author demand. |
| Q3 | Physics | **Custom AABB + tile collision**; opt-in Planck per-Level only if a game needs constraints. |
| Q4 | Coordinate isolation | **Confirmed.** Hard wall: `LevelCanvas` has no flexbox imports; `GameEntity` has no sizing/layout props. Architectural test enforces it. |
| Q5 | TileMap rendering | **`<canvas>`-based** from day 1. Off-screen baked layer is a deferred optimization. |
| Q6 | Tile-paint undo | **Stroke coalescing** via reusable `useCoalescedHistory`; one history entry per pointer-down → up. |
| Q7 | GameView lifecycle | **Per-`GameView` `onExit` prop**: `pause` (default) / `reset` / `persist`. LRU cap of 3 paused runtimes. |

---

## Cross-cutting observations

Three patterns emerged while analyzing these questions that are worth elevating:

1. **The architectural-test script (Q4 / Q5)** is cheap insurance for the "do not modify existing code" rule the PRD insists on. Worth implementing in Phase 0 alongside the `gameMode` flag, not later.
2. **Reusable history coalescing (Q6)** generalizes beyond tile painting — entity drag, multi-tile stroke, animation timeline scrubbing all need it. Build the hook once.
3. **The asset sidecar (Q1)** is more urgent than its phase number suggests. Even *without* the Game Builder, the existing 1.5 MB project file from base64 images means we'd benefit from the sidecar refactor today. Consider lifting it to Phase 0 / 1 so it's in place before Sprite Sheet Manager piles on.

---

## Next steps

1. Review and approve / amend each resolution above.
2. On approval, fold the **Decision summary table** into PRD §19 (replacing the current "open" entries).
3. Update PRD §9 (Lua → JS scripting reframing) and §17 (move asset-sidecar work into Phase 1 if cross-cutting observation #3 is accepted).
4. Begin Phase 0 with: `gameMode` flag + toolbar toggle + project JSON additions + the architectural-test script.
