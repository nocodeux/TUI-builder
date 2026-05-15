# Game Builder — Implementation Roadmap

**Status:** Working plan, updated as phases land
**Companion to:** `GAME_BUILDER_PRD.md` §17 (phase plan) and `GAME_BUILDER_DECISIONS.md` (locked technical decisions)
**Last Updated:** 2026-05-11

This document tracks where we are, what each phase actually unlocks for the user, and what concrete features land in each one. The PRD describes the destination; this roadmap is the route.

---

## What's done

| Phase | Status | What landed |
|---|---|---|
| **0. Foundations** | ✅ shipped `7e418f4` | `gameMode` flag, toolbar toggle, project JSON persistence, architectural guard script |
| **1. Worlds + Levels** | ✅ shipped `a63e837` | Worlds (screens with `kind:'world'`), Levels with their own `rows`, LevelTabs with active-tab fusion, Inspector branches for Level and World, Toolbox extension with `GAME` section (preview entries), per-level content isolation |
| **2. Sprite Sheet Manager + Asset Sidecar** | ✅ shipped `f6aaada` | `projects/<id>.assets.json` sidecar persistence, Sprite Sheet Manager modal (Sprites/Tilesets/Sounds), grid configuration with offsets and 2D-aware gaps, inline gap editor over the canvas, named animations, GIF export per animation, marching-ant border around the builder |

**Current observable state for the user:**
- Game Mode toggles a distinct visual context
- Can create Worlds and Levels with isolated content per level
- Can import sprite sheets, configure grids, define animations, preview and export them
- Sees the GAME section in Toolbox with components marked `(soon)` — no functional game components yet

---

## What's missing (the gap to a playable game)

```
[Assets]  [Worlds]  [Levels]   <—— we are here
   ↓         ↓         ↓
   └─────────┴─────────┘
             ↓
   [Game Components on Canvas]  <—— Phase 3
             ↓
   [Game Runtime + Play Mode]   <—— Phase 4
             ↓
   [Export to standalone HTML]  <—— Phase 5
```

Without Phase 3, the assets in the manager have nowhere to land. Without Phase 4, the placed components don't move, collide, or react. Without Phase 5, the work can't ship.

---

## Phase 3 — Game components on the canvas

**Goal:** Drag a `GameEntity` from the Toolbox onto a Level, configure its sprite + animation in the Inspector, and watch it animate live in the editor. First moment the project "looks like a game builder."

Phase 3 is large — splitting into three focused sub-phases keeps each PR reviewable.

### 3a — GameEntity placement and live preview

The first piece of game content. **Smallest viable slice** to feel like a game builder.

| Deliverable | Notes |
|---|---|
| `LevelCanvas` component | New render path for `<Canvas>` when a Level is selected. Absolute-positioned coordinate system; bypasses LayoutRow / flexbox. Lives in `src/components/LevelCanvas.jsx`. Architectural test (already in place) verifies it doesn't import `LayoutRow`. |
| `GameEntity` component | New file `src/components/Componentes/GameEntity.jsx`. Default props: `role`, `position {x,y}`, `spriteSheetAssetId`, `defaultAnimation`, `facing`, `stats`, basic `persona` placeholder. |
| Toolbox unlock | Remove `preview: true` from `GameEntity` entry → real drag. |
| Drop handler | Dropping `GameEntity` on `LevelCanvas` writes to `level.entities[]` (not `level.rows`). New helper `setLevelEntities`. |
| Inspector branch | `case 'GameEntity':` in Inspector — sprite picker (dropdown of `assets.sprites`), animation picker (dropdown of selected sheet's animations), role select, X/Y position, sizing (renderWidth/renderHeight in world pixels). |
| Live sprite render | `LevelCanvas` renders each entity as an animated sprite — same animation loop pattern as the Sprite Manager preview, but at the entity's position. |
| Selection on `LevelCanvas` | Click an entity → selectedIds set; drag to reposition. Multi-select via shift. |

**Out of scope for 3a:** TileMap, Triggers, physics, gameplay. Just placement and visual feedback.

### 3b — TileMap (background and collision layer)

Tile-based level surface for top-down and platformer levels.

| Deliverable | Notes |
|---|---|
| `TileMap` component | Canvas-based (per Q5 decision). One TileMap per Level (auto-created when level is created — already in the data shape). |
| Tile palette panel | Below the Inspector when a Level is active. Shows each tile from the selected tileset (`assets.tilesets`) as a clickable swatch. |
| Paint mode | Click/drag on `LevelCanvas` paints the selected tile onto the active tile layer. Right-click erases. |
| Layer selector | Tabs above the tile palette: `Background / Collision / Spawn / Overlay`. The `Collision` layer is special — its painted tiles become walkable barriers in the runtime. |
| Stroke history coalescing | Per Q6 — one pointer-down → pointer-up = one history entry. Implements `useCoalescedHistory` hook reusable for entity drag too. |

**Out of scope for 3b:** Auto-tiling, layer blending, animated tiles.

### 3c — Triggers, Teleporters, SpawnPoints, Camera

The wiring that makes a level navigable and interactive.

| Deliverable | Notes |
|---|---|
| `SpawnPoint` component | Marker (no sprite). Drop on canvas → entity records `{ name, position }`. Level's `spawnPointId` (already in data shape) picks one as default. |
| `Camera` component | Marker. Inspector configures `follow: <entityId>` and viewport bounds. At most one per level (enforced in drop handler). |
| `Trigger` component | Area + conditions + actions, per PRD §8. Inspector lets you add/remove condition rows (kind + parameters) and action rows. |
| `Teleporter` component | Trigger preset with `condition: onEnter(playerMain)` and `action: teleport(worldId, levelId, spawnPointId)`. Inspector exposes a "Target" picker that drills World → Level → SpawnPoint. |
| `CollisionShape` component | Box / circle attached to an entity OR placed standalone. Inspector: shape type + dimensions + offset. |

**Out of scope for 3c:** Lua/JS scripting (Phase 6), actually executing the triggers (Phase 4 runtime).

---

## Phase 4 — Game runtime + playtest

**Goal:** Press a Play button on the Level Tabs strip → the player entity responds to keys, walks around, collides with the collision layer, walks into a Teleporter and transitions to another Level. End-to-end loop.

| Deliverable | Notes |
|---|---|
| `src/runtime/gameRuntime.js` | Pure-JS module (no React). Tick loop via `requestAnimationFrame`. Owns: entity state, input, collision, camera, animation playback, trigger evaluation. |
| Custom AABB + tile collision | Per Q3 decision — no Box2D/Matter dependency. Handles top-down (no gravity) and platformer (per-Level gravity) at MVP. |
| Input bindings | Default: WASD/Arrows for `playerMain`. Configurable later for multiplayer. |
| Animation engine | Reads `spriteSheetAssetId` + animation name, plays frames at the configured FPS, swaps animation based on entity state (idle / walk). |
| Trigger evaluation | Per tick: check each Trigger's area against entities-with-matching-role, evaluate conditions, fire actions. |
| Play button | New control on the LevelTabs strip. Click → runtime mounts on top of `LevelCanvas` as a `<canvas>` overlay. Stop button returns to editor. Game state lives in memory only. |
| `GameView` embed-ready | The same runtime can embed inside any Screen via a new `GameView` UI component (lifts Phase 5 dependency). |

**Decisions made already:** custom AABB physics (Q3), JS scripting deferred (Q2 — Lua deferred), per-`GameView` `onExit` semantics (Q7).

---

## Phase 5 — Embedding + export

**Goal:** Export the game as a standalone, distributable HTML+assets bundle. Also enable a Screen-with-`GameView` to ship as part of an exported app.

| Deliverable | Notes |
|---|---|
| `GameView` component | New `src/components/Componentes/GameView.jsx`. Inspector: `worldId`, `onExit` (`pause`/`reset`/`persist`), `autoStart`, sizing. Renders the runtime inline at the chosen frame. |
| Game Export mode | Toolbar's Export button gains a mode picker when `gameMode` is on: `App Export` (current) / `Game Export` / `App + Embedded Game`. |
| Asset repacking | Per-frame extraction → clean output sheet (the user's earlier suggestion lands here, not in author time). Saves space; lets the runtime use a single optimized atlas. |
| ZIP bundle | Uses already-installed `jszip` to package HTML + `assets/` directory. |

---

## Phase 6 — Scripting (JS, sandboxed)

**Goal:** Attach behavior scripts to Triggers and GameEntities for custom logic beyond the built-in action types.

Per Q2 decision: JS, not Lua. Sandboxed via `new Function(host, body)` with a frozen curated API surface. Lua remains a possible future addition if real authoring demand surfaces.

Initial API surface: `getPlayer`, `setBehavior`, `damage`, `setFlag`, `getFlag`, `teleport`, `playSound`, `showDialog`. Defined in PRD §9.3.

---

## Phase 7 — Local multiplayer

**Goal:** Multiple players on the same machine — two-player split-screen platformer, four-player party game, etc.

| Deliverable | Notes |
|---|---|
| Multi-player input | Per-player keyboard mapping; gamepad slots if available. |
| Multiple `Camera` instances | One per player → optional split-screen rendering. |
| Player role expansion | Existing `role: 'player2' | 'player3' | 'player4'` already in the GameEntity data shape gets wired to inputs. |

---

## Phase 8 — Polish

| Deliverable | Notes |
|---|---|
| `ParticleEmitter` | Simple particle system: emit rate, lifetime, velocity range, color tween. |
| `SoundEmitter` | Positional audio source, attached to an entity or world position. |
| Transition effects | Configurable fade/slide on Teleporter actions. |

---

## Deferred / out of v1 scope

- Lua scripting (revisit if author demand)
- Box2D / Planck for rotational physics (revisit if a real game needs joints)
- Network multiplayer (WebRTC or WebSocket — Phase 3 of a hypothetical v2)
- Mobile / native packaging
- Real-time multi-user editing
- 3D rendering
- Procedural generation

---

## Estimating cadence

Rough scale based on Phases 0–2:
- **Phase 0** was small and self-contained (~150 LoC).
- **Phase 1** was the biggest so far (~600 LoC + iteration on UX). Took several rounds.
- **Phase 2** was comparable (~1100 LoC including the manager + iterations).

Going forward:
- **Phase 3a** (GameEntity placement) — small-to-medium, ~400-600 LoC. Most exciting visual progress per LoC.
- **Phase 3b** (TileMap) — medium-to-large, ~800-1000 LoC. Canvas painting + palette UI.
- **Phase 3c** (Triggers/Teleporters/SpawnPoint/Camera) — medium, ~600 LoC of UI plumbing.
- **Phase 4** (runtime) — large, ~800-1200 LoC. The most architecturally meaty piece.
- **Phase 5** (export) — medium, ~600 LoC.
- **Phase 6** (scripting) — small-medium, ~300 LoC.
- **Phase 7/8** — depend on appetite.

Each sub-phase is a commit. We've been doing one phase per ~1-2 conversation cycles which is fine for a single-author project.

---

## What I'd suggest next

**Take Phase 3a first** — it's the biggest user-visible jump for the least code. Watching your sprite animate in the level canvas is the moment the project starts to look like a game. Everything after assumes that foundation exists.

If you want a different cadence (do all of Phase 3 in one chunk, or skip ahead to runtime), say so — the work is the same, just sequenced differently.
