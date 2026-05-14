# TUIFY — Platform Architecture & Action Plan

**Platform:** TUIFY — tuify.app  
**Status:** Living document  
**Last updated:** 2026-05-13  
**Scope:** Full platform — Builder, Game Builder, export, hosting, multiplayer, anti-cheat, LLM AI, agent API, database, deployment

---

## 1. What we have today vs what we need

### Today (local-only dev setup)

| Layer | Current implementation | Problem in production |
|---|---|---|
| Project storage | Vite plugin middleware → local `projects/` folder | Vite plugins don't run in prod builds. No server = no saves |
| Asset storage | `*.assets.json` sidecar next to project | Same — filesystem only, gitignored |
| Settings | `settings.json` on disk + localStorage mirror | localStorage = per-browser, not per-user |
| Auth | None | No concept of users |
| Game runtime | Pure JS, runs in browser | Works — no change needed |
| HUD rendering | React (GameHUD.jsx) in editor, nothing in export | Blocks standalone game export |
| Multiplayer | Not implemented | Requires WebSocket + server authority |
| Game export | Not implemented | Requires build pipeline |

### What the platform needs

```
Browser                         Server (tuify.app)          DB
─────────────────               ────────────────────        ──────────────
Builder UI (React)          →   REST API (Express)      →   PostgreSQL
Game Runtime (vanilla JS)   →   WebSocket (game rooms)  →   PostgreSQL
Web Component embed         →   Static asset CDN        →   S3-compatible
Agent / LLM callers         →   Agent API (separate)    →   PostgreSQL
```

---

## 2. Database strategy — why PostgreSQL, not SQLite/localStorage

### Why localStorage is wrong for projects

- 5MB quota shared across the entire origin
- Cleared by browsers on low storage
- No sharing between devices
- No user isolation (one browser = one user)
- Data lost when clearing browser data

### Why sql.js (SQLite in the browser) is wrong for production

- sql.js runs SQLite compiled to WebAssembly — fine for demo/local use
- No concurrent writes (single-user only)
- The database file must be fully loaded into RAM
- No server-side query execution — all data must be sent to the browser

### PostgreSQL as the production database

PostgreSQL handles:
- Multi-user concurrent writes
- Full-text search on project/game names
- Row-level security (each user sees only their own projects)
- JSON columns for flexible project schema (project.screens, world.levels)
- Real-time subscriptions via pg_notify + Redis pub-sub
- File references (assets stored separately, DB stores metadata + URLs)

### Schema design

```sql
-- Users & Auth
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Projects (Builder mode: screens, UI)
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Untitled',
  theme       TEXT DEFAULT 'theme-nano',
  view_mode   TEXT DEFAULT 'desktop',
  screens     JSONB NOT NULL DEFAULT '[]',   -- screen.rows tree
  database    JSONB NOT NULL DEFAULT '{"tables":[],"data":{}}',
  last_saved  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  is_public   BOOLEAN DEFAULT false
);

-- Worlds (Game Builder mode: levels, entities)
-- Worlds belong to a project (can have many per project)
CREATE TABLE worlds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Untitled World',
  slug        TEXT,                           -- URL-safe name for embed
  levels      JSONB NOT NULL DEFAULT '[]',    -- level.tileMap, level.entities, level.rows (HUD)
  world_settings JSONB NOT NULL DEFAULT '{}',
  last_saved  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  is_published BOOLEAN DEFAULT false          -- published = embeddable by others
);

-- Assets sidecar (sprites, tilesets, sounds)
-- One row per asset, shared across projects/worlds by the same owner
CREATE TABLE assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                  -- 'sprite' | 'tileset' | 'sound' | 'background'
  name        TEXT NOT NULL,
  storage_key TEXT NOT NULL,                  -- path in object storage (S3/local)
  mime_type   TEXT,
  file_size   INTEGER,
  frame_meta  JSONB,                          -- {width,height,cols,rows,gapX,gapY,...}
  transparent_color TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- World-asset join (which assets does a world use)
CREATE TABLE world_assets (
  world_id    UUID REFERENCES worlds(id) ON DELETE CASCADE,
  asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, asset_id)
);

-- Game sessions (for multiplayer)
CREATE TABLE game_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID REFERENCES worlds(id) ON DELETE CASCADE,
  room_code   TEXT UNIQUE NOT NULL,           -- short join code, e.g. "XKCD4"
  host_user_id UUID REFERENCES users(id),
  state       JSONB NOT NULL DEFAULT '{}',    -- current level, entity positions, etc.
  max_players INTEGER DEFAULT 4,
  status      TEXT DEFAULT 'waiting',         -- waiting | active | finished
  created_at  TIMESTAMPTZ DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

-- Players in a game session
CREATE TABLE session_players (
  session_id  UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  player_slot INTEGER NOT NULL,               -- 1,2,3,4
  entity_id   TEXT,                           -- which entity in the world this player controls
  joined_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- Player save data (progress, inventory, scores)
CREATE TABLE player_saves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  world_id    UUID REFERENCES worlds(id) ON DELETE CASCADE,
  save_slot   INTEGER DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}',    -- hp, level, inventory, flags, etc.
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, world_id, save_slot)
);

-- Leaderboards
CREATE TABLE leaderboard_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID REFERENCES worlds(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,                          -- captured at time of entry
  score       BIGINT NOT NULL,
  metadata    JSONB,                          -- level reached, time, etc.
  achieved_at TIMESTAMPTZ DEFAULT now()
);
```

### App database (project content created IN the Builder)

The Builder lets users create their own tables and data (the Database panel). This content lives in `projects.database` as JSONB. For the exported game to access it:

```sql
-- Expose project database tables for read access in games
-- No separate schema needed: query via projects.database->'tables' and projects.database->'data'
-- For write access (form submissions, in-game saves), use player_saves or a generic:

CREATE TABLE project_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL,
  record      JSONB NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Server architecture

### Replacing the Vite plugin

The Vite plugin approach (`configureServer` in vite.config.js) only works in dev mode. For production, we need a real server.

```
src/
  server/                     ← NEW: server-side code
    index.js                  ← Express app entry point
    routes/
      auth.js                 ← /api/auth/*
      projects.js             ← /api/projects/*
      worlds.js               ← /api/worlds/*
      assets.js               ← /api/assets/* (upload, serve)
      games.js                ← /api/games/* (serve game bundle)
      db.js                   ← /api/db/* (project database access)
    middleware/
      auth.js                 ← JWT validation
      rateLimit.js
    ws/
      gameRoom.js             ← WebSocket game room handler
    storage/
      index.js                ← local disk or S3 adapter
```

### API design

```
Auth
  POST /api/auth/register       { email, password, displayName }
  POST /api/auth/login          { email, password } → { token, user }
  POST /api/auth/logout
  GET  /api/auth/me             → current user

Projects (Builder)
  GET  /api/projects            → list user's projects
  POST /api/projects            → create/update project
  GET  /api/projects/:id        → load project
  DEL  /api/projects/:id

Worlds (Game Builder)
  GET  /api/worlds?projectId=x  → list worlds in a project
  POST /api/worlds              → create/update world
  GET  /api/worlds/:id          → load world
  DEL  /api/worlds/:id
  POST /api/worlds/:id/publish  → make publicly embeddable

Assets
  POST /api/assets/upload       → multipart upload, returns asset record
  GET  /api/assets/:id          → serve asset file
  GET  /api/assets?ownerId=x    → list user's assets
  DEL  /api/assets/:id

Game serving (for Web Component)
  GET  /api/games/:worldId/bundle → serve generated game JS bundle
  GET  /api/games/:worldId/data   → world + assets JSON (for lazy loading)
  GET  /play/:worldSlug           → full-page game player

Game sessions (multiplayer)
  POST /api/sessions            → create session { worldId } → { sessionId, roomCode }
  GET  /api/sessions/:roomCode  → get session info
  POST /api/sessions/:id/join   → join as player

Player data
  GET  /api/saves/:worldId      → load player save
  PUT  /api/saves/:worldId      → write player save
  GET  /api/leaderboard/:worldId?limit=10
  POST /api/leaderboard/:worldId → submit score

Project database (content from Builder's DB panel)
  GET  /api/db/:projectId/:tableName         → read all records
  GET  /api/db/:projectId/:tableName/:id     → read one record
  POST /api/db/:projectId/:tableName         → insert (requires auth)
  PUT  /api/db/:projectId/:tableName/:id     → update (requires auth)
```

### Asset storage

Assets (sprites, tilesets, sounds, project thumbnails) are NOT stored as base64 in the database — stored as files, referenced by URL in the DB.

```
Local dev:
  uploads/assets/{ownerId}/{assetId}.{ext}
  Served at: /api/assets/:id

Production (S3-compatible):
  s3://bucket/tuify-assets/{ownerId}/{assetId}.{ext}
  Served via CDN: https://cdn.tuify.app/assets/{assetId}
```

**Storage driver abstraction** — the server talks to one interface regardless of backend:

```js
// src/server/storage/index.js
import { LocalDriver } from './localDriver.js';
import { S3Driver }    from './s3Driver.js';

export const storage = process.env.STORAGE_DRIVER === 's3'
  ? new S3Driver({
      bucket:    process.env.AWS_BUCKET,
      region:    process.env.AWS_REGION,
      endpoint:  process.env.AWS_ENDPOINT_URL,   // Cloudflare R2 / MinIO override
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY,
      publicUrl: process.env.CDN_BASE_URL,        // cdn.tuify.app
    })
  : new LocalDriver({ root: process.env.STORAGE_PATH || './uploads' });

// Both drivers implement the same interface:
await storage.put(key, buffer, mimeType);   // upload
await storage.get(key);                      // download Buffer
await storage.delete(key);
storage.url(key);                            // public URL
```

**S3-compatible backends supported out of the box:**

| Provider | Set `AWS_ENDPOINT_URL` to | Notes |
|---|---|---|
| AWS S3 | (omit — default) | Standard AWS |
| Cloudflare R2 | `https://{accountId}.r2.cloudflarestorage.com` | Free egress, best for CDN |
| MinIO (self-hosted) | `http://minio:9000` | Full control, on-prem |
| Backblaze B2 | `https://s3.us-west-004.backblazeb2.com` | Cheap storage |
| DigitalOcean Spaces | `https://{region}.digitaloceanspaces.com` | Simple |

**Presigned uploads** (for large files, bypass the API server):

```js
// Server generates a presigned URL valid for 5 minutes
// Client uploads directly to S3 — server never touches the bytes
const presignedUrl = await storage.presignPut(key, mimeType, 300);
// Returns: { uploadUrl, publicUrl }
// Client: PUT to uploadUrl with the file bytes
// After upload: client POSTs { assetId, publicUrl } to /api/assets/confirm
```

For files < 10 MB: direct multipart POST to `/api/assets/upload` (simpler).  
For files ≥ 10 MB: presigned URL flow.

**Hosted game bundles** are also stored in S3:

```
s3://bucket/tuify-games/{worldId}/bundle.js      (tuify-game.js, world-specific)
s3://bucket/tuify-pages/{userId}/{slug}/index.html  (hosted published pages)
```

Migration from base64 (current state): On first load of a project with base64 assets, extract and upload them to the asset server, replace with URLs.

---

## 4. Game export & Web Component

### Naming — why {gameName}, not "game-world"

The Web Component tag name `<game-world>` is a placeholder. The correct approach:

- **The custom element tag** is ALWAYS `<tuify-game>` (a fixed, platform-branded name). You can only define a custom element once per page — if you used per-game names, two embeds on the same page would conflict.
- **The JS file** is named after the game: `{WorldName}.js` (e.g., `CastleQuest.js`)
- **The import** self-registers the element: `import './CastleQuest.js'` → registers `<tuify-game>`

```html
<!-- Embedding CastleQuest on any page -->
<script src="https://tuify.app/tuify-game.js"></script>
<tuify-game 
  world="castle-quest"
  scaling="fit"
  style="width:640px; height:480px;">
</tuify-game>
```

The `world` attribute is either:
- A world slug/ID (loads from the server: `/api/games/{world}/data`)
- Or `data-inline` (world JSON embedded directly in the element via a `<script type="application/json">` child)

### Web Component build

```js
// vite.game.config.js
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: {
      entry: 'src/runtime/gameComponent.js',
      name: 'TuifyGame',
      fileName: 'tuify-game',
      formats: ['iife'],        // self-executing, no module system needed
    },
    rollupOptions: {
      external: [],             // zero external deps — everything inlined
    },
    minify: true,
  },
});
```

```
npm run build:game
→ dist/tuify-game.js   (~60KB minified, includes runtime + HUD renderer)
→ dist/tuify-game.min.js
```

### What goes into tuify-game.js

```
tuify-game.js
├── gameRuntime.js        (946 lines, pure JS)
├── tilesetView.js        (80 lines)
├── imageMask.js          (80 lines)
├── hudExportRenderer.js  (NEW ~150 lines — same as renderComponentExport() but DOM-based)
│   └── Renders level.rows using createElement + inline styles
│   └── Same logic as App.jsx renderComponentExport — no React needed
└── TuifyGameElement       (~100 lines)
    ├── Shadow DOM setup
    ├── Canvas + HUD container
    ├── Viewport scaler (ResizeObserver + CSS transform)
    ├── Click-to-focus overlay
    ├── Fetch world data from server (or read inline)
    ├── Keyboard input forwarding
    └── Public API: .pause() .resume() .save() .getState()
```

### HUD export renderer — why NOT a vanilla rewrite

The user raised the right question: why is the HUD in React when the Builder export already generates HTML from the same component tree?

The answer: **it doesn't need to be rewritten**. The HUD renderer for the game export should call `renderComponentExport()` (already in App.jsx) on `level.rows` at export time, just like `exportHTML()` calls it on `screen.rows`. The result is a static HTML string that gets embedded in the game.

For the Web Component, which runs WITHOUT the App.jsx build context, we need a small equivalent function. But it's structurally identical to what already exists — it's a port, not a rewrite.

### Export formats

| Format | Command | Output | Use case |
|---|---|---|---|
| Standalone HTML | Export Game → HTML | `{GameName}.html` | Download & share, offline play |
| Web Component JS | Served by platform | `tuify-game.js` (shared) + `/api/games/{id}/data` | Embedding on any website |
| Full-page URL | `/play/{worldSlug}` | Hosted on server | Direct link, social sharing |
| Inline embed | GameEmbed component | `<tuify-game world="...">` in Builder export | Embedding game in Builder screens |

### Viewport scaling

The game always renders at `viewportCols × tileWidth` by `viewportRows × tileHeight` (native pixels). For embedding, scale with CSS transform:

```js
const observer = new ResizeObserver(([entry]) => {
  const { width: cw, height: ch } = entry.contentRect;
  const scale = Math.min(cw / NATIVE_W, ch / NATIVE_H);
  frame.style.transform = `scale(${scale})`;
  frame.style.transformOrigin = 'top left';
  // Center the scaled frame
  frame.style.marginLeft = `${(cw - NATIVE_W * scale) / 2}px`;
  frame.style.marginTop  = `${(ch - NATIVE_H * scale) / 2}px`;
});
observer.observe(container);
```

---

## 5. Multiplayer architecture

### Room model

```
Player A (browser) ──WebSocket──→ Server game room ──WebSocket──→ Player B (browser)
                                         ↓
                                   PostgreSQL (game state snapshots)
```

Each game session is a **room** on the server. The server is the **authority** — it holds the canonical game state. Clients send input, server broadcasts state updates.

### Server-side authority (why clients don't own state)

Client-side prediction (each client runs physics locally) is complex and cheatable. For the types of games TUIFY targets (2D arcade, platformer, top-down), server-authoritative with 60ms input lag is acceptable.

```
Client sends:     { action: 'input', input: { left: true, jump: false, ... } }
Server processes: runs one tick of GameRuntime with all player inputs
Server broadcasts:{ action: 'state', entities: [...positions...], frame: 1234 }
Client renders:   draws the broadcast state
```

### WebSocket protocol

```js
// Client → Server
{ type: 'join',   roomCode: 'XKCD4', token: '...' }
{ type: 'input',  frame: 1234, input: { left, right, up, down, jump, attack } }
{ type: 'chat',   message: '...' }

// Server → Client
{ type: 'joined', slot: 2, worldData: {...}, players: [...] }
{ type: 'state',  frame: 1234, entities: [...], events: [...] }  // 30 fps broadcast
{ type: 'chat',   from: 'PlayerName', message: '...' }
{ type: 'player_joined', slot: 3, name: '...' }
{ type: 'player_left',   slot: 3 }
{ type: 'game_over',     winner: 2, scores: {...} }
```

### GameRuntime changes for multiplayer

The current `GameRuntime` is single-player. For multiplayer:

1. **Add a player slot concept**: Each entity with `kind: 'playerMain'` maps to a slot (1–4)
2. **Input injection**: Instead of `rt.setInput(action, pressed)` (single player), use `rt.setPlayerInput(slot, action, pressed)`
3. **Server-side tick**: The server creates a `GameRuntime` instance, receives inputs from all connected players, runs `tick()` once per frame, and broadcasts the result
4. **Client-side rendering only mode**: On the client, a lightweight renderer that only draws (no physics) can be used, driven entirely by server state broadcasts

This is additive — single-player mode is unchanged. Multiplayer requires a server-side Node.js process running the GameRuntime.

### WebSocket encryption

All WebSocket traffic runs over **WSS (TLS)**. This covers transport-level security. For additional message-level integrity:

```js
// Server signs each state broadcast with a per-session HMAC key
// generated at room creation and shared only with authenticated players.
// Client verifies the signature before rendering state.

const hmacKey = await crypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']
);

// Per-frame broadcast includes: { frame, entities, sig }
// sig = HMAC-SHA256(JSON.stringify({ frame, entities }), sessionKey)
```

This prevents:
- Packet injection (a third party forging state updates)
- Replay attacks (old valid messages replayed out of order)
- Man-in-the-middle state tampering on public WiFi even if TLS is stripped

The session HMAC key is rotated every 30 minutes and on reconnect.

For **reward-bearing games** (any game where the server issues a prize, credit, or score that has real-world value), add a second layer — see Section 16 (Anti-cheat & reward security).

### Game modes (participants)

TUIFY supports three modes of participation in multiplayer rooms:

| Mode | Description | Auth required |
|---|---|---|
| Human vs Human | Standard multiplayer — all players are humans | Optional (anon ID) |
| Human vs Agent | Open Claw or TUIFY AI agents fill empty slots | Agent API key |
| Agent vs Agent | Fully automated — agents play against each other | Agent API keys for all |

**Agent players** connect via `wss://agents.tuify.app` (not `wss://tuify.app`). They authenticate with an agent API key instead of a session cookie. The game room doesn't care — it treats them as any other player slot.

```js
// Agent joining a game room (Open Claw example)
ws = new WebSocket('wss://agents.tuify.app/ws/game');
ws.send(JSON.stringify({
  type: 'join',
  roomCode: 'XKCD4',
  agentKey: 'tuify_agent_...',
  agentId:  'openclaw-bot-v2',
}));
// From here: same protocol as human players
```

**Tournament agent participation** — agents can enter and play tournaments. They acquire in-game tokens with Solana/USDT the same way humans do (see Section 22). This enables fully automated agent tournaments and agent vs human competitive play.

### Matchmaking (future)

For now: manual room codes (player creates room, shares code). Future: lobby system with skill-based matchmaking.

---

## 6. GameEmbed component (Builder → Game)

### What it does

A new component in the Builder toolbox that embeds a game inside a Builder screen.

```
In the editor:
  <GameEmbed worldId="abc" scaling="fit" width={640} height={480} />
  → renders RuntimeView directly (live preview, no export needed)

In the exported Builder HTML:
  <tuify-game world="abc" ...></tuify-game>
  → loads game from server OR from inline data

In a fully offline export (no server):
  <tuify-game data-inline="...">
    <script type="application/json">{ full world + assets JSON }</script>
  </tuify-game>
```

### Component props

```js
{
  worldId:  '',           // ID of a world in the same project
  worldUrl: '',           // OR: URL to a published world on the server
  scaling:  'fit',        // fit | fill | fixed
  width:    640,
  height:   480,
  showControls: true,     // show key hints overlay
}
```

### Inspector fields

- World selector dropdown (lists all worlds in the current project)
- OR External world URL input
- Scaling mode selector
- Width/Height (fixed mode)
- Show controls toggle

---

## 7. Auth & user management

### Why auth is needed

Without auth:
- All projects on the server are accessible to anyone
- No multiplayer (can't identify players)
- No per-player save data
- No leaderboards with real identities

### Recommended: JWT + social login (X and Google)

```
POST /api/auth/register           → email + password → creates user + returns JWT
POST /api/auth/login              → email + password → returns JWT
GET  /api/auth/x                  → redirect to X (Twitter) OAuth2
GET  /api/auth/x/callback         → handles X OAuth callback → JWT
GET  /api/auth/google             → redirect to Google OAuth2
GET  /api/auth/google/callback    → handles Google OAuth callback → JWT
GET  /api/auth/me                 → { id, email, displayName, avatarUrl, xHandle }
```

JWT stored in `httpOnly` cookie (not localStorage — avoids XSS exposure).

**X (Twitter) OAuth — owner ID sync:**

When a user connects their X account, TUIFY stores `users.x_id` and `users.x_handle`. This is used for:
- Displaying their X handle on their public profile (`tuify.app/{username}`)
- Allowing login with X on subsequent visits
- Verifying identity in agent scenarios (agent can prove it acts on behalf of a verified X account)
- Future: X follower count gating for featured game gallery

```sql
ALTER TABLE users ADD COLUMN x_id      TEXT UNIQUE;
ALTER TABLE users ADD COLUMN x_handle  TEXT;
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
```

**Agent auth with X identity** (for Open Claw and similar platforms):

An Open Claw agent that acts on behalf of a human user can authenticate by presenting:
1. A TUIFY agent API key (proves the agent is authorized)
2. The owner's X OAuth token (proves the agent is acting for that X account)

The server validates both and scopes the session to the X-verified user's data.

### Anonymous sessions for game players

For games embedded on third-party sites where users aren't logged into the Builder:

```js
// On game load, if no auth token:
const anonId = localStorage.getItem('tuify_anon_id') 
               || crypto.randomUUID();
localStorage.setItem('tuify_anon_id', anonId);
// Use anonId as the player identifier for saves and leaderboards
```

Anonymous saves persist in the browser. If the user later creates an account, they can claim their anonymous progress.

---

### Credential rotation

When a secret leaks or needs periodic rotation, use the following procedures per credential type.
The rule of thumb: **changing a secret = invalidating everything signed with it**. Plan accordingly.

---

#### JWT_SECRET

**Effect of rotation:** Every active session (browser localStorage token) becomes invalid immediately. All users are logged out and must re-authenticate.

**Single-user mode (current — Phase 1–4):**
1. Generate a new secret:
   ```bash
   node -e "const c=require('crypto'); console.log(c.randomBytes(32).toString('hex'))"
   ```
2. Replace `JWT_SECRET` in `.env`.
3. Restart the server (`npm run server` or `docker compose restart app`).
4. Log in again — the login modal will appear automatically.

**Multi-user mode (Phase 5+) — zero-downtime rotation:**

To avoid logging out all users at once, run a grace period with two secrets:

1. Add `JWT_SECRET_OLD=<current value>` to `.env` alongside the new `JWT_SECRET`.
2. Update `src/server/middleware/auth.js` to try the new secret first, fall back to the old:
   ```js
   import jwt from 'jsonwebtoken';

   export function requireAuth(req, res, next) {
     const token = (req.headers.authorization || '').replace('Bearer ', '');
     if (!token) return res.status(401).json({ error: 'Authentication required' });

     const secrets = [process.env.JWT_SECRET, process.env.JWT_SECRET_OLD].filter(Boolean);
     for (const secret of secrets) {
       try { req.user = jwt.verify(token, secret); return next(); } catch {}
     }
     return res.status(401).json({ error: 'Invalid or expired token' });
   }
   ```
3. Redeploy. New logins get tokens signed with the new secret. Old tokens still work.
4. After `expiresIn` has elapsed (default: 30 days), remove `JWT_SECRET_OLD` and redeploy.

---

#### ADMIN_PASSWORD

Only applies in single-user mode. No cascading effects — just a direct credential change.

1. Update `ADMIN_PASSWORD` in `.env`.
2. Restart the server.
3. Log in with the new password. Existing JWT tokens remain valid (they don't encode the password).

---

#### AWS / S3 / MinIO keys (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`)

**Effect of rotation:** Asset uploads and CDN URL generation break instantly if the old key is revoked before the new one is deployed.

**Zero-downtime procedure:**
1. In the AWS/MinIO console, create a **new** access key for the `tuify-assets` bucket. Do **not** delete the old key yet.
2. Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env` / docker secrets.
3. Redeploy the server. Verify uploads work with the new key (`POST /api/assets` or a test upload).
4. Delete the old key in the console.

---

#### OAuth secrets (`X_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`)

**Effect of rotation:** Any in-flight OAuth2 `state` parameters signed with the old secret fail. Active sessions are unaffected (the JWT is independent of the OAuth secret).

**Procedure:**
1. Generate a new secret in the X Developer Portal / Google Cloud Console.
2. Update the env var.
3. Restart the server.
4. Users mid-flow (rare — the flow takes seconds) will get an OAuth error and need to retry login. Logged-in users are unaffected.

---

#### Agent API keys (`AGENT_API_KEY_SALT`, `AGENT_REQUEST_SIGNING_KEY`)

**Effect of rotation:**
- `AGENT_API_KEY_SALT` — existing API keys stored as hashes in the DB become unverifiable. All agent integrations break until they re-register new keys.
- `AGENT_REQUEST_SIGNING_KEY` — HMAC-signed requests fail. Agents must re-derive their signing key.

**Procedure (AGENT_API_KEY_SALT):**
1. Rotate the salt.
2. Notify all agent operators — they must generate and register a new API key via `POST /api/agents/keys`.
3. Revoke old keys in the DB: `UPDATE agent_keys SET revoked_at = now() WHERE revoked_at IS NULL;`

**Procedure (AGENT_REQUEST_SIGNING_KEY):**
1. Announce a rotation window to agent operators.
2. Swap the key in `.env`.
3. Redeploy. Agents that haven't updated their signing key will get 403s on signed requests.

---

#### Database password (`DATABASE_URL`)

**Effect of rotation:** The server loses its DB connection immediately if the password is changed in Postgres but not yet in `.env`.

**Zero-downtime procedure:**
1. In psql, add the new password (PostgreSQL allows multiple passwords via `ALTER USER`):
   ```sql
   ALTER USER tuify PASSWORD 'new-password';
   ```
2. Update `DATABASE_URL` in `.env` / docker secrets with the new password.
3. Restart the app container. The pool reconnects with the new password.
4. Verify connections, then optionally force the old password out:
   ```sql
   -- Only needed if you want to invalidate any lingering old-password sessions
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'tuify';
   ```

---

#### Redis password (`REDIS_URL`)

Similar to Postgres rotation. Redis supports `CONFIG SET requirepass` for live rotation without restart, but the app must be updated before the old password is invalidated.

---

#### Quick reference table

| Credential | Sessions invalidated? | Zero-downtime possible? | Restart required? |
|---|---|---|---|
| `JWT_SECRET` | Yes — all users logged out | Yes (dual-secret grace period) | Yes |
| `ADMIN_PASSWORD` | No (JWT stays valid) | Yes | Yes |
| AWS keys | No (not in tokens) | Yes (create new before delete old) | Yes |
| `X_CLIENT_SECRET` | No | Yes | Yes |
| `AGENT_API_KEY_SALT` | N/A — agent keys invalid | No — agents must re-register | Yes |
| `AGENT_REQUEST_SIGNING_KEY` | N/A | No — announce window | Yes |
| Database password | No (not in tokens) | Yes (update `.env` before revoking old) | Yes |
| Redis password | No | Yes (CONFIG SET) | No |

---

#### Rotation schedule (recommended)

| Credential | Frequency | Trigger |
|---|---|---|
| `JWT_SECRET` | Every 90 days or on suspected leak | Scheduled or incident |
| `ADMIN_PASSWORD` | Every 90 days | Scheduled |
| AWS access keys | Every 90 days | Scheduled |
| OAuth secrets | On suspected leak only | Incident |
| Agent key salt | On suspected leak only | Incident |
| DB password | Every 180 days | Scheduled |

Store secrets in a password manager or secrets manager (e.g., 1Password, AWS Secrets Manager, Doppler). Never rotate in place by editing committed files — always use environment variables.

---

## 8. Deployment

### Docker setup

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Build the React app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build          # → dist/ (React frontend)
RUN npm run build:game     # → dist/tuify-game.js (Web Component)

# Start Express server that serves both the API and the React app
CMD ["node", "src/server/index.js"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://tuify:pass@db:5432/tuify
      - STORAGE_DRIVER=s3
      - AWS_BUCKET=tuify-assets
      - AWS_REGION=us-east-1
      - AWS_ENDPOINT_URL=                # leave blank for AWS, set for R2/MinIO
      - CDN_BASE_URL=https://cdn.tuify.app
      - JWT_SECRET=...
      - NODE_ENV=production
    volumes:
      - uploads:/data/uploads

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=tuify
      - POSTGRES_USER=tuify
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
  uploads:
```

### Environment variables

```
# .env
DATABASE_URL=postgresql://tuify:pass@localhost:5432/tuify
JWT_SECRET=...                         # long random secret
APP_URL=https://tuify.app

# Storage
STORAGE_DRIVER=local                   # local | s3
STORAGE_PATH=./uploads                 # for local driver
AWS_BUCKET=tuify-assets                # for s3 driver
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=                      # blank = AWS, set for R2/MinIO
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CDN_BASE_URL=https://cdn.tuify.app     # public asset URL prefix
MAX_UPLOAD_SIZE_MB=50

# LLM (optional — enables AI features)
LLM_PROVIDER=openai                    # openai | anthropic | groq | ollama | custom
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini                  # default model
LLM_BASE_URL=                          # for Ollama / custom providers
LLM_MAX_TOKENS_PER_REQUEST=2000

# Agent API
AGENT_API_ENABLED=true
AGENT_API_KEY_SALT=...                 # for hashing agent API keys in DB (bcrypt rounds applied on top)
AGENT_RATE_LIMIT_RPM=60               # default requests/min per key
AGENT_RATE_LIMIT_BURST=20             # burst tokens above RPM
AGENT_REQUIRE_SIGNED_REQUESTS=false   # enable HMAC body signing for high-value ops
AGENT_REQUEST_SIGNING_KEY=...         # used when AGENT_REQUIRE_SIGNED_REQUESTS=true
AGENT_IP_ALLOWLIST=                   # comma-sep IPs for high-trust keys (Open Claw infra)
AGENT_MAX_CONCURRENT_SESSIONS=10      # per key: prevents one agent from monopolising game rooms
AGENT_WEBHOOK_SECRET=...              # for verifying inbound webhooks from agent platforms
AGENT_SESSION_TOKEN_TTL=3600          # seconds: agent session tokens expire independently of JWTs

# Open Claw integration
OPENCLAW_TENANT_ID=...                # identifies your TUIFY account in the Open Claw registry
OPENCLAW_PUBLIC_KEY=...               # RSA public key — verifies Open Claw request signatures
OPENCLAW_ALLOWED_SCOPES=read:projects,write:worlds,run:games,join:sessions

# Auth providers
X_CLIENT_ID=...                       # X (Twitter) OAuth2 app client ID
X_CLIENT_SECRET=...                   # X (Twitter) OAuth2 app secret
X_CALLBACK_URL=https://tuify.app/api/auth/x/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Wallet / payments
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TUIFY_TREASURY_WALLET=...             # platform treasury Solana address
TETHER_CONTRACT_ADDRESS=...           # USDT contract on Solana (SPL token)
TOKEN_EXCHANGE_RATE=100               # 1 USDT = 100 TUIFY credits
PAYMENT_WEBHOOK_SECRET=...            # for verifying deposit confirmations

# Redis (session cache, rate-limit counters, real-time pub/sub)
REDIS_URL=redis://redis:6379

CORS_ORIGINS=https://tuify.app,https://agents.tuify.app,http://localhost:3001
```

### Managed services — tiffanyatyc.com (recommended provider)

TUIFY's hosting stack runs on **tiffanyatyc.com**, a managed infrastructure provider that bundles everything needed in one place:

| What it provides | TUIFY usage | Config |
|---|---|---|
| PostgreSQL (managed) | All platform data | `DATABASE_URL=postgresql://...` |
| Redis (managed) | Rate limiting, sessions, pub/sub, game room caching | `REDIS_URL=redis://...` |
| MinIO (S3-compatible object storage) | Assets, game bundles, published pages | `AWS_ENDPOINT_URL=https://minio.tiffanyatyc.com` |
| Docker / container hosting | Express server + worker processes | Same `docker-compose.yml` |
| CDN | Asset delivery via `cdn.tuify.app` | Point CDN origin at MinIO bucket |

**Why this is the right choice:**
- Single provider → one support contract, one bill
- Connects with the same AWS SDK (S3-compatible) — no code changes vs AWS
- PostgreSQL + Redis + MinIO collocated → sub-ms latency between services
- Deployment, DB, and storage in the same data centre as the app

**Docker compose for tiffanyatyc.com:**

```yaml
services:
  app:
    build: .
    ports: ["3001:3001"]
    environment:
      - DATABASE_URL=postgresql://tuify:${DB_PASS}@postgres:5432/tuify
      - REDIS_URL=redis://redis:6379
      - STORAGE_DRIVER=s3
      - AWS_ENDPOINT_URL=https://minio.tiffanyatyc.com
      - AWS_BUCKET=tuify-assets
      - CDN_BASE_URL=https://cdn.tuify.app
      - NODE_ENV=production
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    environment: [POSTGRES_DB=tuify, POSTGRES_USER=tuify, POSTGRES_PASSWORD=${DB_PASS}]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

**Agent + multiplayer load considerations:**

When Open Claw agents join multiplayer game rooms, session count scales faster than human-only usage. tiffanyatyc.com containers can scale horizontally — Redis pub/sub ensures all app instances share the same WebSocket room state:

```
App instance 1  ──Redis pub/sub──  App instance 2
    ↑                                   ↑
Human players                    Open Claw agents
```

This means game rooms work across instances without sticky sessions.

---

## 9. Action plan *(superseded — see Section 15 for complete updated roadmap)*

---

## 10. File naming for exported games

### The naming bug

The exported Web Component file should be named after the game, not after the component tag.

Rules:
- **Custom element tag**: always `<tuify-game>` — fixed, platform-branded, no conflicts when multiple games on the same page
- **Exported HTML file**: `{worldName}.html` (e.g., `CastleQuest.html`)
- **The platform JS**: `tuify-game.js` — one shared file served from the platform, loaded once
- **World identifier**: `world` attribute uses the world's `id` or `slug`

```html
<!-- Multiple games on the same page — no conflict because tag is fixed -->
<script src="https://tuify.app/tuify-game.js"></script>

<tuify-game world="castle-quest" style="width:640px;height:480px;"></tuify-game>
<tuify-game world="space-race"   style="width:320px;height:240px;"></tuify-game>
```

### Slug generation

```js
const slug = world.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
// "Castle Quest 2" → "castle-quest-2"
```

Slugs are unique per user. Conflicts resolved by appending `-2`, `-3`, etc.

---

## 11. Analytics & stats — platform and user level

### Why this matters

Without stats: you don't know if the platform is growing, which features are used, where games fail, or when the server is about to fall over. This is non-optional for a production platform.

Two audiences: **us** (platform operators) and **our users** (builders who want to understand their games and apps).

---

### 11a. Platform-level stats (operator dashboard)

These are the metrics the platform team needs to run the business and understand infrastructure health.

#### Growth & usage

```sql
-- Pre-aggregated daily metrics table (populated by a nightly job)
CREATE TABLE platform_metrics_daily (
  date            DATE PRIMARY KEY,
  new_users       INTEGER DEFAULT 0,
  active_users    INTEGER DEFAULT 0,   -- logged in at least once
  total_users     INTEGER DEFAULT 0,
  new_projects    INTEGER DEFAULT 0,
  active_projects INTEGER DEFAULT 0,
  new_worlds      INTEGER DEFAULT 0,
  total_worlds    INTEGER DEFAULT 0,
  game_sessions_started   INTEGER DEFAULT 0,
  game_sessions_completed INTEGER DEFAULT 0,
  total_play_minutes      BIGINT DEFAULT 0,
  assets_uploaded INTEGER DEFAULT 0,
  storage_used_mb BIGINT DEFAULT 0,
  api_requests    BIGINT DEFAULT 0,
  errors_total    INTEGER DEFAULT 0,
  ws_peak_connections INTEGER DEFAULT 0
);
```

#### Event stream (raw events for analytics)

```sql
CREATE TABLE platform_events (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id  UUID,                     -- anonymous session
  event_type  TEXT NOT NULL,            -- see enum below
  entity_type TEXT,                     -- 'project' | 'world' | 'game_session' | 'asset'
  entity_id   UUID,
  properties  JSONB DEFAULT '{}'
);

CREATE INDEX ON platform_events (ts);
CREATE INDEX ON platform_events (event_type);
CREATE INDEX ON platform_events (user_id);
```

Event types:
```
user.registered        user.login              user.login_failed
project.created        project.saved           project.deleted      project.exported_html
world.created          world.saved             world.deleted
world.exported_html    world.exported_webcomp  world.published      world.unpublished
game.play_started      game.play_ended         game.level_completed game.player_died
game.session_created   game.session_joined     game.session_ended
asset.uploaded         asset.deleted
tournament.created     tournament.started      tournament.ended
error.runtime          error.api               error.auth
embed.loaded           embed.play_started      embed.origin         (referrer URL)
```

#### Platform admin API

```
GET /admin/metrics/overview          → { totalUsers, activeToday, gamesPlayed30d, storageUsedGB, ... }
GET /admin/metrics/growth?period=30d → daily new users + projects + games
GET /admin/metrics/top-games         → most played worlds
GET /admin/metrics/top-builders      → most active users
GET /admin/metrics/errors            → error rate by type, last 24h
GET /admin/metrics/infrastructure    → server CPU, memory, DB connections, WebSocket count
GET /admin/events?type=X&since=Y     → raw event stream with filters
```

Access: protected by `role: 'admin'` on the users table.

---

### 11b. User-level stats (builder dashboard)

Every user can see stats for their own projects and games.

#### Project stats

```sql
CREATE TABLE project_stats (
  project_id    UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  total_screens INTEGER DEFAULT 0,
  total_rows    INTEGER DEFAULT 0,
  total_components INTEGER DEFAULT 0,
  exports_total INTEGER DEFAULT 0,
  last_exported TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

#### Game (world) stats

```sql
CREATE TABLE world_stats (
  world_id          UUID PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  total_plays       BIGINT DEFAULT 0,
  unique_players    BIGINT DEFAULT 0,
  avg_session_secs  INTEGER DEFAULT 0,
  total_play_secs   BIGINT DEFAULT 0,
  completions       BIGINT DEFAULT 0,       -- reached a level with type 'win'
  deaths_total      BIGINT DEFAULT 0,
  embed_loads       BIGINT DEFAULT 0,       -- times <tuify-game> loaded
  embed_origins     JSONB DEFAULT '{}',     -- { "example.com": 142, "itch.io": 33 }
  last_played       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

#### Builder dashboard API

```
GET /api/stats/projects              → list projects with their stats
GET /api/stats/projects/:id          → single project detail
GET /api/stats/worlds                → list worlds with play stats
GET /api/stats/worlds/:id            → single world: plays, unique players, level heatmap
GET /api/stats/worlds/:id/players    → recent players (anonymous or named)
GET /api/stats/worlds/:id/leaderboard → top scores
GET /api/stats/assets                → storage used, asset count by type
```

---

### 11c. Game-level analytics (in-game events)

The game runtime can emit events that flow to the server for analysis.

```js
// In tuify-game.js / GameRuntime — analytics hooks
class GameRuntime {
  _emit(event, data = {}) {
    if (!this._analyticsEnabled) return;
    navigator.sendBeacon('/api/analytics/event', JSON.stringify({
      worldId: this._worldId,
      sessionId: this._sessionId,
      event,
      ...data,
      ts: Date.now(),
    }));
  }
}
```

Events emitted automatically:
- `game.play_started` — viewport entered, first input received
- `game.play_ended` — tab closed, component disconnected
- `game.level_started` / `game.level_completed` — level navigation
- `game.player_died` — `{ position, cause, level }`
- `game.score_submitted` — when the game calls `rt.submitScore()`

This gives game creators a **level heatmap** (which levels players reach and die on) and **drop-off analysis** (where players quit).

### 11d. Agent usage metrics

```sql
CREATE TABLE agent_metrics_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  api_key_id      UUID REFERENCES agent_api_keys(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_platform  TEXT,          -- 'openclaw' | 'cursor' | 'custom' | ...
  api_calls       INTEGER DEFAULT 0,
  game_sessions   INTEGER DEFAULT 0,     -- number of game rooms joined
  tokens_used     INTEGER DEFAULT 0,     -- LLM tokens consumed via TUIFY's LLM proxy
  export_count    INTEGER DEFAULT 0,
  publish_count   INTEGER DEFAULT 0,
  UNIQUE (date, api_key_id)
);
```

Platform-level agent dashboard (admin only):
- Active agent API keys today
- Calls per agent platform (Open Claw vs Cursor vs custom)
- Agent participation in game sessions (human vs agent, agent vs agent room counts)
- Token spending via agent keys
- Anomaly alerts: key exceeding 10× normal call rate

### 11e. Reward & prize metrics

```sql
CREATE TABLE reward_metrics_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  world_id        UUID REFERENCES worlds(id) ON DELETE CASCADE,
  spins_total     INTEGER DEFAULT 0,
  spins_by_agents INTEGER DEFAULT 0,
  prizes_issued   INTEGER DEFAULT 0,
  prizes_redeemed INTEGER DEFAULT 0,
  prizes_expired  INTEGER DEFAULT 0,
  anomalies_flagged INTEGER DEFAULT 0,
  UNIQUE (date, world_id)
);
```

Operator dashboard shows:
- Spins/hour per game (spike detection)
- Human vs agent spin ratio (flag if agents dominate a reward game)
- Prize redemption funnel (issued → redeemed → expired)
- Flagged accounts (> 3σ win rate)

### 11f. Payment & wallet metrics

```sql
CREATE TABLE payment_metrics_daily (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  deposits_usdt       NUMERIC(18,6) DEFAULT 0,   -- USDT received
  deposits_sol        NUMERIC(18,9) DEFAULT 0,   -- SOL received
  tokens_issued       BIGINT DEFAULT 0,           -- TUIFY credits issued
  tokens_spent        BIGINT DEFAULT 0,           -- TUIFY credits consumed in games
  tokens_in_prizes    BIGINT DEFAULT 0,           -- TUIFY credits awarded as prizes
  unique_payers       INTEGER DEFAULT 0,
  unique_payers_agents INTEGER DEFAULT 0,
  failed_payments     INTEGER DEFAULT 0,
  UNIQUE (date)
);
```

### 11g. Session recording & heatmaps (Microsoft Clarity equivalent)

For the **TUIFY Builder UI** (not the games), TUIFY runs its own session recording to understand how users build:

```js
// Implemented with rrweb (open source session recording)
// src/client/recording.js — loaded only in production, not in exported games

import { record } from 'rrweb';
record({
  emit: (event) => {
    // Batch events and send via sendBeacon every 10s
    eventBuffer.push(event);
    if (eventBuffer.length >= 50 || timeSinceLast > 10000) {
      navigator.sendBeacon('/api/telemetry/session', JSON.stringify({
        sessionId: window.__tuify_session__,
        events: eventBuffer.splice(0),
      }));
    }
  },
  // Mask all user-created content (project names, assets)
  // Only record UI interaction patterns (clicks, navigation)
  maskTextSelector: '.project-name, .canvas-area, [data-private]',
  maskInputOptions: { color: true, date: true, email: true, password: true, text: true },
});
```

**Heatmap data derived from session events:**
```sql
CREATE TABLE ui_heatmap_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- 'click' | 'rage_click' | 'dead_click' | 'scroll_stop'
  target_path TEXT,           -- CSS selector path of clicked element
  viewport_w  INTEGER,
  viewport_h  INTEGER,
  x           FLOAT,
  y           FLOAT,          -- normalized 0-1 relative to viewport
  ts          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON ui_heatmap_events (event_type, target_path);
CREATE INDEX ON ui_heatmap_events (ts);
```

**What this tells us:**
- Which toolbox components are most/least used
- Where users click and don't get a response (dead clicks)
- Rage clicks (3+ rapid clicks = frustration)
- Scroll depth in the inspector panel
- Most-visited screens in the Builder (which features are used most)
- Drop-off: where users leave and never come back

**Privacy:** No screen content is recorded — only interaction coordinates and UI element paths. User data (project content, asset names) is masked before transmission.

---

## 12. Observability — knowing when things break

### The three pillars

```
Logs     → what happened and when (text records per event)
Metrics  → how many times / how long (numbers over time)
Traces   → why it was slow (per-request timeline)
```

### Logging — Pino + Loki

```js
// src/server/logger.js
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

// Every request logged:
// { level: 'info', method: 'POST', url: '/api/projects', status: 200,
//   duration: 43, userId: 'abc', reqId: 'uuid' }
```

In production, logs stream to **Grafana Loki** (self-hosted) or **Datadog** / **Logtail** (managed). Loki integrates with Grafana so logs and metrics are in the same dashboard.

### Metrics — Prometheus + Grafana

```js
// src/server/metrics.js
import { Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

export const activeWebSockets = new Gauge({
  name: 'ws_active_connections',
  help: 'Active WebSocket connections',
});

export const gameSessionsActive = new Gauge({
  name: 'game_sessions_active',
  help: 'Active multiplayer game rooms',
});

export const apiErrors = new Counter({
  name: 'api_errors_total',
  labelNames: ['route', 'error_type'],
});
```

Prometheus scrapes `GET /metrics` every 15s. Grafana displays dashboards.

Key dashboards to build:
1. **Overview**: requests/s, error rate, P99 latency, active WebSockets
2. **Users**: DAU/MAU, registrations/h, login failures
3. **Games**: active sessions, plays/min, assets served/s
4. **Infrastructure**: CPU, memory, DB connections, disk usage

### Error tracking — Sentry

```js
// src/server/index.js
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });

// src/main.jsx (browser)
import * as Sentry from '@sentry/react';
Sentry.init({ dsn: process.env.VITE_SENTRY_DSN });
```

Sentry captures:
- Unhandled exceptions on the server (with stack trace, request context, user ID)
- Browser errors in the Builder UI
- Runtime errors in the game (when embedded via Web Component)
- Performance issues (slow API calls, large renders)

### Uptime monitoring

- **Better Uptime** or **UptimeRobot**: ping `/health` every 60s, alert via Slack/email/PagerDuty when down
- `/health` endpoint returns:
  ```json
  { "status": "ok", "db": "ok", "storage": "ok", "ws": "ok",
    "uptime": 3600, "version": "1.2.3" }
  ```
- Separate checks for: main app, WebSocket endpoint, game CDN, database

### Alerting thresholds

| Metric | Warning | Critical |
|---|---|---|
| API error rate | >1% | >5% |
| P99 latency | >500ms | >2s |
| DB connection pool | >70% | >90% |
| Disk usage | >70% | >85% |
| Active WebSockets | >1000 | >5000 |
| Failed logins (per IP) | >20/min | >100/min → auto-block |
| Memory | >80% | >95% |

### Real User Monitoring (RUM)

For the Builder UI specifically:

```js
// Track slow renders and interactions
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 100) {
      Sentry.captureMessage('Slow interaction', {
        extra: { name: entry.name, duration: entry.duration }
      });
    }
  }
});
observer.observe({ type: 'longtask' });
```

---

## 13. Tournaments

### Data model

```sql
CREATE TABLE tournaments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id      UUID REFERENCES worlds(id) ON DELETE CASCADE,
  organizer_id  UUID REFERENCES users(id),
  name          TEXT NOT NULL,
  description   TEXT,
  format        TEXT DEFAULT 'leaderboard',  -- 'leaderboard' | 'bracket' | 'time-trial'
  status        TEXT DEFAULT 'draft',         -- draft | registration | active | finished
  max_players   INTEGER,
  entry_fee     INTEGER DEFAULT 0,            -- in platform credits, 0 = free
  prize_pool    JSONB DEFAULT '{}',           -- { place1: '...', place2: '...' }
  rules         JSONB DEFAULT '{}',           -- lives, time limit, allowed levels
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournament_participants (
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT now(),
  best_score    BIGINT DEFAULT 0,
  best_run_at   TIMESTAMPTZ,
  run_count     INTEGER DEFAULT 0,
  rank          INTEGER,                      -- computed, updated by leaderboard job
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE tournament_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  score         BIGINT NOT NULL,
  metadata      JSONB DEFAULT '{}',           -- level reached, time, deaths
  replay_key    TEXT,                         -- reference to stored replay if implemented
  submitted_at  TIMESTAMPTZ DEFAULT now()
);

-- For bracket format
CREATE TABLE tournament_brackets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round         INTEGER NOT NULL,
  match_number  INTEGER NOT NULL,
  player1_id    UUID REFERENCES users(id),
  player2_id    UUID REFERENCES users(id),
  winner_id     UUID REFERENCES users(id),
  player1_score BIGINT,
  player2_score BIGINT,
  played_at     TIMESTAMPTZ
);
```

### Tournament formats

**Leaderboard**: Everyone plays freely during the tournament window. Highest score wins. Works for single-player and any-time submission.

**Time trial**: Fixed time window (e.g., 60 seconds), best score in that window. Triggered simultaneously for all players via WebSocket broadcast.

**Bracket**: 1v1 elimination. Players are matched in pairs (same game session), winner advances. Requires multiplayer.

### Tournament lifecycle

```
draft → registration → active → scoring → finished
  ↑                      ↓
  edit            (can extend if bracket not complete)
```

Real-time leaderboard during tournament: WebSocket room dedicated to the tournament broadcasts rank updates whenever a score is submitted.

```
POST /api/tournaments             → create tournament
GET  /api/tournaments/:id         → tournament details + current leaderboard
POST /api/tournaments/:id/join    → register
POST /api/tournaments/:id/submit  → submit run score
GET  /api/tournaments/:id/bracket → bracket state
WS   /tournaments/:id             → real-time rank updates
GET  /api/worlds/:worldId/tournaments → tournaments for a game
```

---

## 14. React export & advanced developer integration

### The problem

The Builder currently exports to HTML. This works for standalone web apps but excludes a large developer audience: **React developers who want to use the Builder as a UI design tool and consume the output in their own React projects**.

Two distinct needs:
1. **I want my Builder screen as a React component** — drop it into my codebase as JSX
2. **I want to keep using the Builder for design but have my React app render it** — live sync between Builder and codebase

---

### 14a. Export formats for React developers

#### Format 1 — Static HTML (current)

Already works. Best for: landing pages, simple prototypes, non-React deployments.

Limitations: No React lifecycle, no props, no TypeScript types, no hot reload.

#### Format 2 — JSX component export

Generate a `.jsx` file from a screen. The Builder renders the screen tree as JSX code.

```jsx
// LoginScreen.jsx (generated)
// Generated by TUIFY Builder — do not edit manually
// To update: re-export from the Builder or use @tuify/react

import React from 'react';

export function LoginScreen({ onLogin, onRegister, onForgotPassword }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column',
                    width: 400, border: '2px solid #00aa00', background: '#0a0a0a' }}>
        <div style={{ padding: '4px 8px', background: 'rgba(0,170,0,0.1)',
                      borderBottom: '1px solid #00aa00', display: 'flex' }}>
          <span style={{ color: '#00aa00', fontFamily: 'monospace', fontSize: 12 }}>
            Login
          </span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            placeholder="Username"
            style={{ background: '#0a0a0a', border: '1px solid #00aa00',
                     color: '#00ff00', fontFamily: 'monospace', padding: '4px 8px' }}
          />
          <button
            onClick={onLogin}
            style={{ background: 'transparent', border: '1px solid #00aa00',
                     color: '#00aa00', fontFamily: 'monospace', cursor: 'pointer' }}>
            [ LOGIN ]
          </button>
        </div>
      </div>
    </div>
  );
}
```

What `renderComponentToJSX()` needs to do:
- Same tree traversal as `renderComponentExport()` but emits JSX string instead of HTML string
- Button `action: 'screen'` → `onClick` prop (name derived from `targetScreenId`)
- Button `action: 'external'` → `onClick={() => window.open(href)}`
- Form submissions → optional `onSubmit` prop
- Static text → hardcoded. Dynamic text (from DB) → `{props.data?.fieldName ?? 'default'}`

New export buttons in the toolbar:
- `Export → HTML` (current)
- `Export → JSX` (new — downloads `{ScreenName}.jsx`)
- `Export → ZIP (all screens)` (new — downloads all screens as JSX + an `index.js` barrel)

#### Format 3 — `@tuify/react` schema renderer (recommended for live sync)

Instead of generating JSX that becomes stale when the design changes, publish an NPM package that renders Builder schemas at runtime.

```bash
npm install @tuify/react
```

```jsx
// In your React project
import { TuifyScreen } from '@tuify/react';
import loginSchema from './designs/LoginScreen.tuify.json';

export function LoginPage() {
  return (
    <TuifyScreen
      schema={loginSchema}
      onAction={(action, props) => {
        if (action === 'navigate' && props.target === 'home') {
          router.push('/');
        }
      }}
      data={{ username: currentUser?.name }}
    />
  );
}
```

The `.tuify.json` file is the screen's component tree (the same JSON the Builder already stores). The developer keeps it in source control. When they want to update the design, they re-export from the Builder and replace the JSON file.

**`TuifyScreen` component contract:**

```ts
interface TuifyScreenProps {
  schema: TuifyScreenSchema;        // the Builder's screen.rows JSON
  onAction?: (                     // called for button clicks, form submits
    action: 'navigate' | 'submit' | 'external' | 'custom',
    props: Record<string, unknown>
  ) => void;
  data?: Record<string, unknown>;  // injected into Text/Label components with {{fieldName}}
  theme?: Partial<NanoTheme>;      // override colors
  viewMode?: 'desktop' | 'mobile';
}
```

**`@tuify/react` package contents:**

```
@tuify/react
├── TuifyScreen          — renders a screen schema
├── NanoApp             — renders multiple screens with navigation
├── useNanoState        — hook for managing screen navigation state
├── components/         — the same component set (Window, Button, etc.) as the Builder
│   └── All components are pure React, same props interface as the Builder
└── types/              — TypeScript types for schemas and props
```

This package is essentially the Builder's component set extracted into a standalone NPM package. The Builder itself imports from it — same source of truth.

#### Format 4 — CLI sync tool

For teams that use the Builder actively and want schema files to stay in sync:

```bash
npx tuify pull --project my-project-id --output ./src/designs
# Downloads all screens as .tuify.json files

npx tuify watch --project my-project-id --output ./src/designs
# Watches for Builder saves, auto-updates .tuify.json files via long-poll or WebSocket
```

The CLI authenticates with the Builder server using an API token (generated in user settings).

---

### 14b. Importing existing React interfaces into the Builder

This is the reverse direction: a developer has existing React components and wants to bring them into the Builder for visual editing.

#### What's realistic vs what's not

| Approach | Feasibility | Why |
|---|---|---|
| Auto-parse JSX → Builder schema | Very hard | JSX is a superset of JS. Arbitrary React components can use hooks, context, dynamic logic — impossible to reverse-engineer into a static schema |
| Import Storybook stories | Medium | Stories define props and rendering. Can be parsed with AST tools to extract layout |
| Import from Figma / Sketch | Medium | Plugins available for these tools. Design → schema is more tractable than code → schema |
| Manual JSON schema authoring | Easy | Developer writes `.tuify.json` directly. We provide a JSON Schema + VS Code extension for autocomplete |
| Snapshot import (screenshot → schema) | Future (AI) | Take a screenshot, use LLM to generate the approximate schema |

#### Recommended path: Builder Schema as a published standard

Define and publish the `.tuify.json` format as an open schema:

```json
// LoginScreen.tuify.json (hand-authored or generated)
{
  "id": "login-screen",
  "name": "Login Screen",
  "rows": [
    {
      "id": "row-1",
      "layout": { "direction": "row", "justify": "center", "align": "center" },
      "children": [
        {
          "id": "window-1",
          "type": "Window",
          "props": {
            "title": "Login",
            "width": 400,
            "sizing": { "widthMode": "fixed", "heightMode": "hug" }
          },
          "children": [
            { "id": "btn-1", "type": "Button", "props": {
                "label": "Login",
                "action": "custom",
                "customAction": "login"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

With a JSON Schema published at `https://tuify.app/schemas/nano-screen.json`, developers get:
- VS Code autocomplete when editing `.tuify.json`
- Validation in CI (schema check)
- Can manually craft schemas and import them into the Builder

#### Import flow in the Builder

```
File → Import Screen → select .tuify.json
→ validates against schema
→ adds as new screen in the current project
→ opens in canvas for editing
```

This is a small addition (~50 lines in App.jsx) — read the JSON, validate the `rows` structure, call `addScreen(imported)`.

---

### 14c. TypeScript support

For Format 2 (JSX export) and Format 3 (`@tuify/react`), TypeScript types should be generated automatically.

```ts
// Generated types for LoginScreen.jsx
export interface LoginScreenProps {
  onLogin?: () => void;           // from Button with action:'custom', customAction:'login'
  onRegister?: () => void;
  onForgotPassword?: () => void;
  data?: {
    username?: string;            // from Text with dataField:'username'
    errorMessage?: string;
  };
}
```

Types are derived from:
- Button `customAction` values → function prop names
- Text/Label `dataField` values → `data` object keys
- Form fields → submit handler with field names

---

### 14d. Storybook integration

For teams that use Storybook, the Builder can generate stories:

```ts
// LoginScreen.stories.ts (generated)
import type { Meta, StoryObj } from '@storybook/react';
import { LoginScreen } from './LoginScreen';

const meta: Meta<typeof LoginScreen> = {
  title: 'Screens/LoginScreen',
  component: LoginScreen,
};
export default meta;

export const Default: StoryObj = {};
export const WithError: StoryObj = {
  args: { data: { errorMessage: 'Invalid password' } }
};
```

---

### 14e. Figma plugin (future)

A Figma plugin that reads Figma frames and generates `.tuify.json` schemas. Direction: Figma → Builder (design import). This is a separate project but the `.tuify.json` format makes it tractable.

---

## 16. Anti-cheat & reward game security

### The threat model

When a game issues real-world rewards (prizes, credits, tokens, coupons), any client-side randomness or score calculation is an attack surface. The attacker controls the browser — they can:
- Modify JS in DevTools to force favourable outcomes
- Replay valid API calls ("keep spinning the same lucky outcome")
- Intercept and modify network responses
- Script automated play at superhuman speed

A slot machine or roulette game that runs its RNG in the browser **must be considered broken by design**. 

### Core principle: the server owns all outcomes

```
Client:  "I want to spin."
Server:  Rolls RNG → decides outcome → records it → returns result
Client:  Displays animation matching the server-decided outcome
```

The client only animates. It has **zero influence** on the outcome.

### Provably fair RNG (for transparency)

```
1. Server generates: seed + nonce (before each session)
2. Server publishes: SHA-256(seed + nonce) — the commitment hash
3. Player spins:     server reveals seed + nonce after the round
4. Player can verify: SHA-256(seed + nonce) matches the commitment
5. Player can verify: outcome = PRNG(seed + nonce + spinIndex)
```

This proves the server didn't change the outcome after the player decided to spin. Commitment hash is shown in the UI.

### Signed reward claims

```js
// Server, after deciding outcome:
const claim = {
  userId:    session.userId,
  worldId:   session.worldId,
  sessionId: session.id,
  spinIndex: session.spinCount,
  outcome:   { symbol: ['cherry','cherry','cherry'], prize: 'free_spin' },
  issuedAt:  Date.now(),
  expiresAt: Date.now() + 60_000   // claim must be used within 60s
};
const sig = signHMAC(JSON.stringify(claim), process.env.REWARD_SIGNING_KEY);
// Returns { claim, sig } to client — client shows the UI animation
// To redeem: client sends { claim, sig } to /api/rewards/redeem
// Server: verifies sig, checks expiry, marks sessionId+spinIndex as redeemed
```

The combination of HMAC signature + expiry + one-time redemption prevents:
- Forged claims (no key → can't produce a valid sig)
- Replayed claims (spinIndex + sessionId tracked in DB, can only be redeemed once)
- Time-shifted claims (expiry enforced server-side)

### Rate limiting and anomaly detection

```sql
-- Track spin history for anomaly analysis
CREATE TABLE reward_spins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  world_id    UUID REFERENCES worlds(id),
  session_id  UUID NOT NULL,
  spin_index  INTEGER NOT NULL,
  outcome     JSONB NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  spun_at     TIMESTAMPTZ DEFAULT now(),
  redeemed    BOOLEAN DEFAULT false,
  UNIQUE (session_id, spin_index)
);

-- Rate: max 1 spin per 3 seconds per user
-- Velocity: max 200 spins per day per user
-- Win rate monitoring: if user wins > 3σ above expected rate → flag for review
```

Statistical monitoring runs as a background job:
- If user win rate for prize outcomes exceeds expected by > 3 standard deviations → auto-suspend + alert
- If same IP wins across multiple accounts → flag for review
- If session token is used from multiple IPs → invalidate session

### Reward game configuration (Game Builder)

In the TUIFY Game Builder, when a world has `rewardMode: true`:

```js
// world_settings additions
{
  rewardMode: true,
  rewardProvider: 'tuify',          // tuify | external
  externalRewardWebhook: '',        // POST {outcome, claim, sig} to this URL
  spinCooldownMs: 3000,
  maxSpinsPerDay: 200,
  outcomes: [
    { id: 'miss',       weight: 70, prize: null },
    { id: 'small_win',  weight: 20, prize: { type: 'points', amount: 10 } },
    { id: 'big_win',    weight:  9, prize: { type: 'coupon',  code: 'LUCKY10' } },
    { id: 'jackpot',    weight:  1, prize: { type: 'custom',  label: 'Grand Prize' } },
  ]
}
```

The `weight` values sum to 100. RNG on the server selects based on these weights. The client never sees the weights table.

**External webhook**: if the game owner manages prizes outside TUIFY (e.g., in their own system), the server POSTs the signed claim to their endpoint, they process the reward, return `{ status: 'ok' }`. TUIFY records the delivery attempt and result.

### Multiplayer anti-cheat summary

| Attack | Mitigation |
|---|---|
| Speed hack (faster ticks) | Server controls tick rate — client inputs are timestamped, out-of-window inputs rejected |
| Position teleport | Server validates entity movement per-tick against max speed |
| Score inflation | Scores only accepted from server-side GameRuntime, not from client |
| Reward replay | One-time signed claim tokens, stored spinIndex per sessionId |
| RNG prediction | All RNG on server, committed before reveal (provably fair) |
| Bot/automation | Behavioral anomaly detection, CAPTCHA on session start (optional) |
| Account sharing | IP/session fingerprint analysis, alert on concurrent sessions |

---

## 22. Wallet & token economy — Solana + USDT

### Core principle

TUIFY uses cryptocurrency as the **entry currency** and **internal TUIFY credits** as the **prize currency**. Real crypto never leaves the platform as a prize.

```
User/Agent deposits:  SOL or USDT (real crypto)
                          ↓
                    [Exchange at fixed rate]
                          ↓
Platform issues:    TUIFY Credits (internal tokens)
                          ↓
Credits used for:   game entry fees, tournament buy-ins, premium features
                          ↓
Credits won as:     prizes, tournament rewards (never SOL/USDT directly)
```

This model:
- Eliminates regulatory "money transmission" risk (we're not paying out crypto)
- Keeps prize pools predictable (exchange rate is fixed)
- Prevents wash trading (credits can't be re-converted to SOL/USDT)
- Allows agents to participate financially the same way humans do

### Solana wallet integration

```js
// Client-side: connect wallet (Phantom, Solflare, Backpack)
import { useWallet } from '@solana/wallet-adapter-react';
const { publicKey, sendTransaction, signMessage } = useWallet();

// Verify wallet ownership (sign a nonce, don't ask for transaction)
const nonce = await fetch('/api/wallet/nonce').then(r => r.json());
const signed = await signMessage(new TextEncoder().encode(nonce.message));
await fetch('/api/wallet/verify', {
  method: 'POST',
  body: JSON.stringify({ publicKey: publicKey.toString(), signature: Array.from(signed), nonce: nonce.id })
});
// → links wallet address to user account
```

```sql
ALTER TABLE users ADD COLUMN solana_wallet TEXT UNIQUE;   -- verified wallet address
ALTER TABLE users ADD COLUMN tuify_credits BIGINT DEFAULT 0;  -- in-platform token balance
```

### USDT deposit flow (SPL Token on Solana)

```
1. User opens "Add Credits" modal
2. Server generates a deposit address (our treasury wallet) + unique memo
3. User sends USDT (SPL) to treasury wallet with memo
4. Server monitors via Solana RPC: watches for incoming SPL transfers to treasury
5. On confirmed transfer (1 confirmation): credits = amount × TOKEN_EXCHANGE_RATE
6. User's tuify_credits balance updated in DB
7. Deposit recorded in payment_history table
```

```sql
CREATE TABLE payment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  source_type     TEXT NOT NULL,        -- 'usdt_deposit' | 'sol_deposit' | 'credit_spend' | 'prize_credit'
  amount_crypto   NUMERIC(18,9),        -- original crypto amount (null for credit-only txns)
  currency        TEXT,                 -- 'USDT' | 'SOL'
  tx_signature    TEXT,                 -- Solana transaction ID
  credits_delta   BIGINT NOT NULL,      -- positive = received, negative = spent
  balance_after   BIGINT NOT NULL,
  memo            TEXT,                 -- deposit memo / game context
  status          TEXT DEFAULT 'confirmed',  -- pending | confirmed | failed
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### SOL deposit flow

Same as USDT, but `source_type = 'sol_deposit'`. SOL is converted at current market rate (fetched from a price oracle at deposit time, locked for 5 minutes). Rate is stored with the deposit record.

### TUIFY Credits spending

Credits are consumed for:
- **Game entry** — tournament buy-in (e.g., 100 credits to enter)
- **Reward game spin** — each spin may cost credits (configured per game)
- **Premium features** — more export storage, custom domains, etc.

All deductions are atomic DB transactions:
```sql
-- Atomic credit spend (prevents double-spend)
UPDATE users SET tuify_credits = tuify_credits - 100
WHERE id = $userId AND tuify_credits >= 100
RETURNING tuify_credits;
-- If 0 rows returned: insufficient credits → reject
```

### Prize distribution

Winners receive **TUIFY credits only** — never SOL or USDT:

```js
// Tournament prize pool: 10 players × 100 credits = 1000 credits
// 1st: 500 credits, 2nd: 300 credits, 3rd: 200 credits
await db.transaction(async trx => {
  await trx('users').where({ id: winner1 }).increment('tuify_credits', 500);
  await trx('payment_history').insert({
    user_id: winner1, source_type: 'prize_credit',
    credits_delta: 500, memo: `Tournament ${tournamentId} 1st place`
  });
  // ... etc
});
```

### Agent payments

Open Claw agents and other automated agents participate with the same credit system:
- Agent's owner pre-loads credits to the account
- Agent uses the TUIFY API to join games/tournaments (credits deducted from owner's balance)
- Agent winnings accrue to the owner's TUIFY credits balance

```js
// Agent API: check balance + join tournament
GET  /api/agent/wallet/balance         → { credits: 1500 }
POST /api/agent/wallet/join-tournament → { tournamentId, creditsSpent: 100, creditsRemaining: 1400 }
```

### Security considerations

| Threat | Mitigation |
|---|---|
| Deposit memo collision | Memo is UUID — collision probability negligible |
| Double-spend | Solana tx signature stored UNIQUE in payment_history — duplicate ignored |
| Front-running deposit | 1 confirmed block required, memo must match pending deposit record |
| Credit exhaustion attack | Per-user daily spend limit configurable |
| Insider prize manipulation | Prize distributions are logged + require admin sign-off for amounts > 10,000 credits |
| Rate manipulation | Exchange rate locked at deposit time, not settable by user |

---

## 17. Hosted publishing — tuify.app/username/...

### Publishing model

Every user gets a namespace at `tuify.app/{username}`. They can publish:
- **Apps**: `tuify.app/username/myapp` — exported Builder project, hosted by TUIFY
- **Games**: `tuify.app/username/mygame` — full-page game player, hosted by TUIFY

No file management needed — user clicks "Publish" in the Builder.

### Publish flow

Assets (sprites, tilesets, audio) are **already in S3** from the moment they were uploaded during the build process. Publishing does not re-upload them — it simply:

1. Runs the export HTML/game pipeline (same as "Download" but server-side)
2. Generates the `index.html` referencing existing S3 CDN URLs
3. Uploads only `index.html` to S3 (tiny, < 50 KB typically)
4. Upserts a record in `published_pages`
5. CDN edge cache serves the result

```
User: clicks "Publish" in the Builder toolbar
  ↓
Server: calls exportHTML(projectId) or exportGame(worldId)
        All asset URLs already point to cdn.tuify.app/{assetId} — no upload needed
  ↓
Server: uploads index.html to S3
        s3://tuify-pages/{userId}/{slug}/index.html   ← only this new file
  ↓
Server: upserts published_pages row
  ↓
CDN: tuify.app/{username}/{slug} → S3 index.html (cached at edge)
```

**Re-publish** (user updates the design and publishes again):
- Same flow — overwrites `index.html` only
- CDN cache invalidated for that key
- Asset files unchanged in S3 (content-addressed by assetId)

**Versioning** (future): keep `index.html` history as `index.v{n}.html` in S3 so rollback is a metadata change.

### Database additions

```sql
CREATE TABLE published_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id   UUID NOT NULL,             -- project_id OR world_id
  source_type TEXT NOT NULL,             -- 'project' | 'world'
  slug        TEXT NOT NULL,             -- URL-safe name: my-app, castle-quest
  title       TEXT,
  description TEXT,
  thumbnail_url TEXT,
  storage_key TEXT NOT NULL,             -- S3 key prefix for this publication
  published_at TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  is_public    BOOLEAN DEFAULT true,
  custom_domain TEXT,                    -- future: custom domain support
  visit_count  BIGINT DEFAULT 0,
  UNIQUE (owner_id, slug)
);

CREATE INDEX idx_published_pages_owner ON published_pages(owner_id);
CREATE INDEX idx_published_pages_slug ON published_pages(owner_id, slug);
```

### Server routes

```
GET  /api/publish/check-slug/:slug        → available or taken
POST /api/publish                         → publish or re-publish
     { sourceId, sourceType, slug, title, description }
GET  /api/publish/list                    → user's published items
DEL  /api/publish/:slug                   → unpublish (removes from CDN)
PUT  /api/publish/:slug/settings          → update visibility, description

# Public-facing (served from CDN or server)
GET  /{username}/{slug}                   → published page/game
GET  /{username}                          → user's public profile + published items
```

### CDN routing

```nginx
# nginx reverse proxy rule (or CloudFront behavior):
# /tuify-static/*  → S3 bucket
# /{username}/{slug}  → check published_pages, serve from S3 key
# /api/*             → Express server
# /*                 → React app (Builder)

location ~* ^/([a-zA-Z0-9_-]+)/([a-zA-Z0-9_-]+)$ {
  # Try to serve a published page
  proxy_pass http://api:3001/serve/$1/$2;
}
```

The `/serve/:username/:slug` Express handler:
1. Looks up `published_pages` by username + slug
2. Generates a signed S3 URL (if private) or redirects to CDN URL (if public)
3. Returns the HTML

### Slug resolution rules

- Slug is set at publish time, editable once (redirect from old slug kept for 30 days)
- Slug must be 3–64 chars, alphanumeric + hyphens
- Reserved slugs: `api`, `play`, `admin`, `games`, `apps`, `help`, `pricing`, `blog`
- Username conflicts with reserved slugs: users can't register reserved names

### Custom domains (Phase 11+)

```
User sets: mysite.com → tuify.app/username/myapp
Steps:
  1. User adds CNAME: www.mysite.com → cname.tuify.app
  2. User verifies domain (TXT record)
  3. TUIFY provisions SSL cert (Let's Encrypt / Cloudflare)
  4. Server matches Host header → routes to the correct published_page
```

---

## 18. Shadcn/UI sync & component bridge

### Why Shadcn matters

shadcn/ui is the dominant React component library in 2025–2026. Many TUIFY users are developers who already build UIs with shadcn. The goal is bidirectional:
- **Import**: shadcn components can be used as TUIFY canvas components
- **Export**: TUIFY screens export as shadcn-compatible JSX

### Mapping — shadcn → TUIFY components

| shadcn component | TUIFY equivalent | Status |
|---|---|---|
| `Button` | Button | ✅ exists |
| `Input` | InputField | ✅ exists |
| `Textarea` | Textarea | ✅ exists |
| `Select` | Dropdown | ✅ exists |
| `Checkbox` | Checkbox | ✅ exists |
| `Switch` | Toggle | ✅ exists |
| `Label` | Label | ✅ exists |
| `Card` | Window | ✅ exists (structural) |
| `Badge` | Badge | needs creation |
| `Avatar` | Avatar | needs creation |
| `Progress` | ProgressBar | needs creation |
| `Slider` | Slider | needs creation |
| `Tabs` | TabGroup | needs creation |
| `Dialog` | Modal | needs creation |
| `Tooltip` | Tooltip | needs creation |
| `Toast / Sonner` | Toast | needs creation |
| `Table` | DataTable | needs creation |
| `Calendar` | DatePicker | needs creation |
| `Accordion` | Accordion | needs creation |
| `Sheet` (drawer) | SideDrawer | needs creation |
| `Separator` | Divider | needs creation |
| `Skeleton` | Skeleton | needs creation |
| `ScrollArea` | ScrollContainer | needs creation |
| `RadioGroup` | RadioGroup | needs creation |
| `Command / Combobox` | Combobox | needs creation |
| `Breadcrumb` | Breadcrumb | needs creation |
| `Pagination` | Pagination | needs creation |
| `Alert` | AlertBanner | needs creation |
| `HoverCard` | HoverCard | needs creation |

Priority: Badge, Avatar, Progress, Slider, Tabs, Dialog, Toast, Table, Accordion — these cover > 80% of typical shadcn usage.

### TUIFY MCP server for developers

An MCP (Model Context Protocol) server that lets LLM-powered tools (Cursor, Claude Code, VS Code Copilot) interact with TUIFY components:

```
src/server/mcp/
  index.js          ← MCP server entry point
  tools/
    listComponents.js    ← list all TUIFY components + props
    getComponent.js      ← get full props schema for a component
    shadcnToTuify.js     ← convert shadcn JSX → TUIFY schema node
    tuifyToShadcn.js     ← convert TUIFY schema node → shadcn JSX
    createProject.js     ← create a new TUIFY project
    addScreen.js         ← add a screen to a project
    placeComponent.js    ← place a component on a screen
    exportScreen.js      ← export a screen as HTML or JSX
```

```json
// MCP server manifest (mcp.json)
{
  "name": "tuify",
  "version": "1.0.0",
  "description": "TUIFY Builder — visual UI and game creation platform",
  "tools": [
    {
      "name": "shadcn_to_tuify",
      "description": "Convert a shadcn/ui component usage to a TUIFY canvas node",
      "inputSchema": {
        "type": "object",
        "properties": {
          "jsx": { "type": "string", "description": "shadcn JSX snippet to convert" }
        }
      }
    },
    {
      "name": "place_component",
      "description": "Place a component on a TUIFY screen",
      "inputSchema": {
        "type": "object",
        "properties": {
          "projectId": { "type": "string" },
          "screenId":  { "type": "string" },
          "component": { "type": "string", "description": "TUIFY component type" },
          "props":     { "type": "object" }
        }
      }
    }
  ]
}
```

### Conversion logic: shadcn → TUIFY node

```js
// src/server/mcp/tools/shadcnToTuify.js
// Given: <Button variant="destructive" size="sm">Delete</Button>
// Returns TUIFY schema node:
{
  type: 'Button',
  props: {
    label: 'Delete',
    variant: 'danger',    // mapped from shadcn "destructive"
    size: 'small',        // mapped from "sm"
  }
}
```

Conversion is table-driven (prop name mapping + value mapping per component). Unsupported shadcn props are passed through to a `customProps` bag for inspection.

### Conversion logic: TUIFY → shadcn JSX export

The existing **Section 14 (React export)** already covers JSX export. For shadcn output, the `renderComponentToJSX()` function uses a `shadcn` mode that:
- Uses shadcn import paths (`@/components/ui/button`)
- Maps TUIFY prop names back to shadcn prop names
- Wraps the output in a function component with shadcn providers

### Platform-level shadcn bootstrap (one-time MCP import)

Before any user-facing shadcn support can work, TUIFY must first import and convert the entire shadcn component library into its own toolbox. This is a **one-time platform build step**, not a user-facing action:

```bash
# Run once when setting up the platform (or when updating shadcn)
npx @tuify/mcp shadcn-import \
  --source @shadcn/ui \
  --all \
  --output src/components/Componentes/Shadcn/

# What it does:
# 1. Fetches all shadcn component source files via npm
# 2. AST-parses each component
# 3. Maps props to TUIFY prop schema
# 4. Generates a TUIFY component wrapper in src/components/Componentes/Shadcn/
# 5. Registers each in the Toolbox catalog
# 6. Writes the shadcn→TUIFY mapping table to src/lib/shadcnMap.js
```

After this bootstrap, all shadcn components appear in the TUIFY toolbox under a **"Shadcn"** category group — usable exactly like native TUIFY components. No user setup needed.

### Importing a shadcn screen into TUIFY (user workflow)

1. User pastes shadcn JSX code into TUIFY's **Import panel** (or the MCP `shadcn_to_tuify` tool handles it)
2. Parser extracts the JSX tree using `@babel/parser`
3. Each component type is looked up in `shadcnMap.js`
4. Unknown components get a **Placeholder** node with the raw JSX preserved for manual completion
5. The resulting TUIFY screen is loaded into the canvas and is fully editable

```
shadcn JSX → @babel/parser AST → shadcnMap lookup → TUIFY schema nodes → canvas
```

**Agent workflow**: an MCP-connected agent (Cursor, Claude Code, Open Claw) can call `shadcn_to_tuify` tool directly — no copy-paste needed. The agent sends the JSX, TUIFY returns the `.tuify.json` schema, the agent can immediately place it on a screen via `add_screen`.

### Developer install (npm package)

```bash
# Add the TUIFY MCP server to your project
npm install -g @tuify/mcp

# Run the MCP server (connects to tuify.app or local server)
tuify-mcp --server https://tuify.app --apiKey YOUR_KEY

# Configure in Cursor / VS Code:
# .cursor/mcp.json or .vscode/mcp.json
{
  "servers": {
    "tuify": {
      "command": "tuify-mcp",
      "args": ["--server", "https://tuify.app", "--apiKey", "YOUR_KEY"]
    }
  }
}
```

---

## 19. Figma plugin — bidirectional

### Scope

The plugin works **in both directions**:
- **Figma → TUIFY** (import): bring a Figma design into the Builder canvas
- **TUIFY → Figma** (export): push a TUIFY screen back to Figma as a frame

Both directions use `.tuify.json` as the interchange format.

### Direction 1 — Figma → TUIFY (import)

1. User selects a Figma frame
2. Plugin traverses the Figma node tree
3. Each Figma node type is mapped to a TUIFY component
4. Plugin generates a `.tuify.json` schema
5. Plugin UI offers: "Download .tuify.json" or "Send to TUIFY" (direct API push)

### Figma → TUIFY node mapping

| Figma node | TUIFY component | Notes |
|---|---|---|
| FRAME / GROUP | Row / Column / Window | Based on layout direction |
| AUTO_LAYOUT (horizontal) | Row | direction = horizontal |
| AUTO_LAYOUT (vertical) | Column | direction = vertical |
| TEXT | Label or Text | multiline → Text |
| RECTANGLE (with fill) | Container | solid color fill → backgroundColor |
| IMAGE | Image | src = Figma CDN URL (exported) |
| VECTOR / SVG | Image | exported as SVG |
| ELLIPSE | Container | borderRadius = 50% |
| COMPONENT / INSTANCE | Named TUIFY component | matched by Figma component name |
| BUTTON (by name) | Button | recognized by Figma component naming convention |
| INPUT (by name) | InputField | recognized by Figma component naming convention |

### Direction 2 — TUIFY → Figma (export)

TUIFY Builder adds an **"Export to Figma"** button in the toolbar. It:

1. Serializes the current screen to `.tuify.json`
2. Posts it to the Figma plugin receiver via the TUIFY plugin
3. Plugin reconstructs the Figma node tree from the `.tuify.json` schema
4. Creates a new Figma frame (or updates an existing one with the same screen name)

```
TUIFY export pipeline:
  screen.rows (TUIFY schema) → renderToFigmaNodes() → Figma REST API (create/update frame)
```

**TUIFY → Figma node mapping** (reverse of import):

| TUIFY component | Figma node created | Notes |
|---|---|---|
| Row | AUTO_LAYOUT (horizontal) | gap, padding preserved |
| Column | AUTO_LAYOUT (vertical) | — |
| Window | FRAME | title shown as layer name |
| Button | COMPONENT instance (Button) | requires Button component in Figma file |
| Label / Text | TEXT | font, color mapped |
| Image | IMAGE or RECTANGLE + fill | src if URL accessible |
| InputField | COMPONENT instance (Input) | — |
| Container | RECTANGLE | background, border, radius mapped |

If the user's Figma file doesn't have matching component definitions, TUIFY creates plain equivalents (frames + auto-layout). A TUIFY Figma Component Library (published on Figma Community) provides the component definitions for perfect fidelity.

### Plugin architecture (bidirectional)

```
Figma plugin sandbox
  ├── import mode: traverses selected frame → postMessage({ type:'import', schema })
  └── export mode: receives schema via postMessage → reconstructs Figma nodes

Plugin UI (iframe)
  ├── "Import from Figma" tab
  │   → traverses selection, previews schema
  │   → Download .tuify.json | Send to TUIFY
  └── "Export to Figma" tab
      → user pastes TUIFY project URL or drops .tuify.json
      → fetches schema via TUIFY API (user's API key)
      → sends to plugin sandbox → creates Figma frame
```

**Live sync** (future): webhook from TUIFY notifies the Figma plugin when a screen is updated, auto-pushes the diff to Figma.

### Limitations

Auto-import gives a 60–80% skeleton. Manual completion needed for:
- Custom fonts not in TUIFY's theme
- Complex gradient fills
- Interactive states (hover, focus) — handled in TUIFY Inspector separately
- Animations (Figma Smart Animate → TUIFY has no animation system yet)

---

## 20. LLM integration — model-agnostic AI

### Design principle

TUIFY is **model-agnostic**. No single LLM provider is hardcoded. The LLM layer sits behind an abstraction that accepts any OpenAI-compatible API (which covers OpenAI, Anthropic via proxy, Groq, Mistral, Ollama, and most providers).

### Provider abstraction

```js
// src/server/llm/index.js
export class LLMClient {
  constructor({ provider, apiKey, model, baseUrl, maxTokens }) {
    this.model    = model;
    this.maxTokens = maxTokens;
    // All providers that support OpenAI-compatible /chat/completions:
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || providerDefaults[provider].baseUrl,
    });
  }

  async chat(messages, tools = []) {
    return this.client.chat.completions.create({
      model:      this.model,
      messages,
      tools:      tools.length ? tools : undefined,
      max_tokens: this.maxTokens,
    });
  }

  async stream(messages) {
    return this.client.chat.completions.create({
      model:    this.model,
      messages,
      stream:   true,
    });
  }
}

const providerDefaults = {
  openai:    { baseUrl: 'https://api.openai.com/v1' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1' },   // via Anthropic OpenAI-compat layer
  groq:      { baseUrl: 'https://api.groq.com/openai/v1' },
  mistral:   { baseUrl: 'https://api.mistral.ai/v1' },
  ollama:    { baseUrl: 'http://localhost:11434/v1' },
};
```

### Platform LLM configuration

In the Builder's Settings panel:

```
LLM Provider:    [ OpenAI ▼ ]  [ Anthropic ▼ ]  [ Groq ▼ ]  [ Ollama ▼ ]  [ Custom ]
API Key:         [•••••••••••••••••••]
Model:           [ gpt-4o-mini ▼ ]
Base URL:        [ https://api.openai.com/v1 ] (editable for custom)
Max tokens/req:  [ 2000 ]
[ Test connection ]
```

Config is stored per-user in the DB (`users.llm_config JSONB`). The API key is encrypted at rest (AES-256) using the server's `LLM_KEY_ENCRYPTION_KEY` env var. It is never returned to the client after saving.

Platform-level LLM config (used when user hasn't configured their own): set via server env vars. This can be a rate-limited free-tier key for demos.

### Feature 1: AI GameEntity (NPC & enemy behavior)

Each GameEntity in the Game Builder can have a `persona` object (already in the data model):

```js
// GameEntity props (existing + AI additions)
{
  id: 'npc_merchant',
  kind: 'npc',
  name: 'Old Merchant',
  spriteSheet: '...',
  // AI persona (new)
  aiEnabled: true,
  aiMode: 'llm',          // 'llm' | 'rule-based' | 'scripted'
  persona: {
    role: 'Friendly merchant who sells potions',
    personality: 'Grumpy but fair, speaks in short sentences',
    knowledge: 'Knows about the dungeon to the east, unaware of the king’s death',
    goals: 'Sell inventory, avoid danger',
    constraints: 'Will not follow player, stays in market area',
  },
  dialogueHistory: [],    // maintained in player_saves
  aiModel: '',            // override platform default for this entity
}
```

**Runtime behavior:**

```js
// In GameRuntime, when player interacts with an AI entity:
async function handleEntityInteraction(entity, player) {
  if (!entity.aiEnabled || entity.aiMode !== 'llm') {
    // fallback: static dialogue tree
    return entity.dialogueTree;
  }
  
  const history = await loadEntityDialogueHistory(entity.id, player.userId);
  const response = await fetch('/api/llm/entity-chat', {
    method: 'POST',
    body: JSON.stringify({
      entityId: entity.id,
      worldId:  runtime.worldId,
      message:  player.lastInteractionText,
      history,
    })
  });
  return await response.json();  // { text, actions: [{type:'give_item', item:'potion'}] }
}
```

**Server-side (stateless, streamed):**

```js
// POST /api/llm/entity-chat
// Rate limited: 1 call per 2s per user, max 50/day (prevents LLM cost abuse)
router.post('/entity-chat', authMiddleware, rateLimitLLM, async (req, res) => {
  const { entityId, worldId, message, history } = req.body;
  const world  = await db.worlds.findById(worldId);
  const entity = world.levels.flatMap(l => l.entities).find(e => e.id === entityId);
  
  const systemPrompt = buildEntitySystemPrompt(entity.persona, world.name);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),   // last 10 turns for context
    { role: 'user', content: message },
  ];
  
  const stream = await llm.stream(messages);
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk.choices[0].delta)}\n\n`);
  }
  res.end();
});
```

### Feature 2: AI-assisted Builder (screen generation)

```
User types: "Create a login screen with email, password, and a Google login button"
  ↓
POST /api/llm/generate-screen
  ↓
Server calls LLM with: TUIFY component schema + user prompt
  ↓
LLM returns: JSON array of TUIFY screen nodes
  ↓
Server validates schema, sanitizes
  ↓
Client receives and renders on canvas — user can edit
```

The LLM is given the full TUIFY component schema (component names + prop types) as a system prompt. It generates `.tuify.json` format. This is safer than asking it to generate JSX — the schema is constrained.

### Feature 3: AI enemy behavior (rule generation)

For enemies that should patrol/chase/attack without full LLM latency:

```js
// Game Builder: user describes enemy behavior in plain English
// "Patrols left-right, chases player when within 3 tiles, attacks on contact"
// 
// AI generates: a behavior tree as JSON rules (one-time, at design time)
// The generated rules run in GameRuntime with zero LLM latency at play time

{
  behavior: [
    { type: 'patrol', axis: 'x', range: 3 },
    { type: 'chase',  target: 'player', triggerDistance: 3, speed: 2 },
    { type: 'attack', target: 'player', damage: 1, cooldown: 60 }
  ]
}
```

### Cost controls

| Control | Implementation |
|---|---|
| Per-user daily token limit | Tracked in `llm_usage` table, enforced before each call |
| Per-entity call rate limit | 1 call/2s, 50 calls/day (configurable per world) |
| Max tokens per request | Configurable, default 2000 |
| Kill switch | `LLM_ENABLED=false` env var disables all LLM routes |
| User-supplied key | User's own API key bypasses platform limits |

```sql
CREATE TABLE llm_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  calls       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);
```

---

## 21. Agent infrastructure & API

### The agent layer

TUIFY must serve two different principals:
- **Humans**: use the Builder UI via browser
- **Agents**: automated callers (AI assistants, CI pipelines, Open Claw agents, VS Code Copilot) that interact programmatically

These need different auth, rate limits, response formats, and routing.

### Domain routing — humans, backend, agents separated

```
https://tuify.app          → human-facing: Builder UI + published pages
https://api.tuify.app      → backend only: internal service-to-service calls, not agent-public
https://agents.tuify.app   → agent-facing: REST API + MCP server + agent WebSocket
```

This separation means:
- `tuify.app` CORS allows browsers, serves HTML — agents should not use this
- `api.tuify.app` is backend-internal (no public agent docs here)
- `agents.tuify.app` is agent-only: no HTML, JSON-only responses, strict API-key auth

Traffic identification on `agents.tuify.app`:

```js
// src/server/middleware/identify.js
export function identifyPrincipal(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const agentId    = req.headers['x-agent-id'];      // optional: agent self-identification
  const isAgentHost = req.hostname === 'agents.tuify.app';

  if (authHeader.startsWith('Bearer tuify_agent_') || isAgentHost) {
    req.principal = { type: 'agent', apiKey: authHeader.slice(7), agentId };
  } else {
    req.principal = { type: 'human' };
  }
  next();
}
```

**WebSocket for agent game participation:**

```
wss://agents.tuify.app/ws/game   — agent game room connections (same protocol as humans)
wss://tuify.app/ws/game          — human game room connections
```

Both resolve to the same game room handler on the server — separation is at the auth + rate-limit layer only.

### Agent API keys

```sql
CREATE TABLE agent_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash    TEXT UNIQUE NOT NULL,   -- SHA-256(key), never store plaintext
  name        TEXT NOT NULL,          -- 'My Cursor integration', 'CI pipeline'
  scopes      TEXT[] NOT NULL,        -- ['read:projects','write:projects','run:export']
  last_used   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
```

Key format: `tuify_agent_{base62(32 random bytes)}` — unambiguously identifiable in logs.

### Agent-callable API

All routes below accept agent API keys and return clean JSON (no HTML, no redirects).

```
# Project management
GET    /api/agent/projects                    → list projects
POST   /api/agent/projects                    → create project
GET    /api/agent/projects/:id                → get project schema
PUT    /api/agent/projects/:id                → update project
DEL    /api/agent/projects/:id

# Screen editing
GET    /api/agent/projects/:id/screens        → list screens
POST   /api/agent/projects/:id/screens        → add screen
PUT    /api/agent/projects/:id/screens/:sid   → update screen (full schema)
POST   /api/agent/projects/:id/screens/:sid/components  → add component
PUT    /api/agent/projects/:id/screens/:sid/components/:cid  → update component

# Game worlds
GET    /api/agent/worlds                      → list worlds
POST   /api/agent/worlds                      → create world
PUT    /api/agent/worlds/:id                  → update world
POST   /api/agent/worlds/:id/entities         → add entity to level
PUT    /api/agent/worlds/:id/entities/:eid    → update entity

# Export & publishing
POST   /api/agent/projects/:id/export         → export to HTML, returns download URL
POST   /api/agent/worlds/:id/export           → export game, returns download URL
POST   /api/agent/publish/:slug               → publish to tuify.app/username/slug

# Assets
POST   /api/agent/assets/upload               → upload asset (multipart)
GET    /api/agent/assets                      → list assets

# LLM features
POST   /api/agent/llm/generate-screen         → generate screen from description
POST   /api/agent/llm/generate-entity         → generate entity behavior

# Read-only platform info
GET    /api/agent/components                  → full component catalog + prop schemas
GET    /api/agent/components/:type            → single component schema
```

### Rate limiting — humans vs agents

| Metric | Human | Agent (platform key) | Agent (own key) |
|---|---|---|---|
| API calls/minute | 120 | 60 | 300 |
| Exports/hour | 20 | 10 | 100 |
| Asset uploads/day | 200 | 100 | 1000 |
| LLM calls/day | 50 | 20 | unlimited (own cost) |

Agents that supply their own LLM API key bypass LLM rate limits (they pay directly).

### TUIFY MCP server (for AI assistants)

The MCP server from Section 18 (Shadcn bridge) doubles as the general agent interface for LLM tools. It wraps the agent API:

```
Cursor / VS Code Copilot / Claude Code
  → MCP protocol →
TUIFY MCP server (local npm package or remote)
  → HTTP →
TUIFY agent API (api.tuify.app)
```

Full tool list exposed via MCP:

```
Project tools:   list_projects, create_project, get_project, update_project
Screen tools:    list_screens, add_screen, place_component, update_component, remove_component
World tools:     list_worlds, create_world, add_entity, update_entity
Export tools:    export_html, export_game, publish_page, publish_game
Asset tools:     upload_asset, list_assets
LLM tools:       generate_screen, generate_entity_behavior
Info tools:      list_components, get_component_schema, shadcn_to_tuify, tuify_to_shadcn
```

### Open Claw / third-party agent integration

Agents that want to use TUIFY as a tool:

```python
# Example: Open Claw agent builds a game via TUIFY API
import tuify_sdk   # pip install tuify-sdk (wraps the agent API)

client = tuify_sdk.Client(api_key="tuify_agent_...")

# Create a new game world
world = client.worlds.create(name="Space Shooter", project_id="...")

# Add player entity
player = client.worlds.add_entity(world.id, level=0, entity={
  "kind": "playerMain",
  "name": "Ship",
  "spriteSheet": "...",
  "x": 10, "y": 10
})

# Add enemies
for i in range(5):
  client.worlds.add_entity(world.id, level=0, entity={
    "kind": "enemy",
    "name": f"Alien {i}",
    "aiMode": "rule-based",
    "behavior": [{"type": "patrol", "axis": "x", "range": 4}]
  })

# Export the game
result = client.worlds.export(world.id, format="html")
print(result.download_url)  # https://tuify.app/api/exports/xyz.html

# Publish it
page = client.publish(world.id, slug="space-shooter")
print(page.url)  # https://tuify.app/username/space-shooter
```

SDK packages:
- `tuify-sdk` (Python) — for Python-based agents and automation
- `@tuify/sdk` (Node.js) — for JS automation, CI pipelines
- MCP server — for LLM tool use (no SDK needed, just npm install)

### Agent view in the Builder UI

A dedicated **Agent Monitor** tab visible in Builder settings (for users with agent keys):

```
┌────────────────────────────────────────────────────────────┐
│ Agent Monitor                               [+ New API Key] │
├────────────────────────────────────────────────────────────┤
│ Active API Keys                                             │
│  ○ Cursor integration    last used: 2min ago   [Revoke]    │
│  ○ CI pipeline          last used: 3hr ago    [Revoke]    │
│                                                            │
│ Recent agent calls (last 24h)                             │
│  2min ago  place_component  LoginScreen  ✓ 201           │
│  2min ago  get_project      my-app       ✓ 200           │
│  3hr ago   export_html      my-app       ✓ 200           │
│                                                            │
│ Usage today:  12 API calls · 2 exports · 0 LLM calls      │
└────────────────────────────────────────────────────────────┘
```

### Security model for agents

| Concern | Mitigation |
|---|---|
| Key leakage | Keys hashed in DB (SHA-256 + salt). Plaintext shown only once at creation. |
| Scope creep | Each key has explicit scopes, enforced per-route |
| Cross-user access | All agent routes scoped to `req.user.id` derived from key lookup |
| Abuse / spam | Per-key rate limits, auto-revoke on anomaly (> 10x normal rate) |
| SSRF via asset upload | Asset URLs validated against allowlist of domains |
| Prompt injection via LLM | System prompts are server-controlled, user/agent input only fills `content` |
| Agent impersonating human | `X-Agent-Id` presence prevents session cookie auth from working simultaneously |

---

## 15. Updated action plan phases

Replacing Section 9 with the complete prioritized roadmap including everything above.

### Phase 0 — Fixes ✅ DONE
- [x] localStorage fallback for project saves
- [x] Icon paths for production builds
- [x] Export collapse fix (worlds filtered from HTML export)
- [x] SVG image sizing fix

### Phase 1 — Real server + DB (2 weeks)
- [ ] Express server (`src/server/index.js`)
- [ ] PostgreSQL schema (users, projects, worlds, assets, published_pages)
- [ ] `/api/projects`, `/api/worlds`, `/api/assets` routes
- [ ] Storage driver abstraction (local + S3-compatible)
- [ ] Presigned upload flow for large files (> 10 MB)
- [ ] Docker + docker-compose (app + postgres + optional MinIO)
- [ ] Basic `/health` endpoint
- [ ] Pino structured logging

### Phase 2 — Auth (1 week)
- [ ] Register / login / logout endpoints
- [ ] JWT in httpOnly cookie
- [ ] Auth middleware on all routes
- [ ] Frontend: login/register modal
- [ ] All data scoped to `req.user.id`

### Phase 3 — Observability (1 week, parallel with other phases)
- [ ] Prometheus metrics middleware (HTTP, WS, game sessions, agent calls)
- [ ] Grafana dashboard (Docker service) — include agent + reward + payment boards
- [ ] Sentry for server errors and browser errors
- [ ] Platform events table + event emission in all routes (11a)
- [ ] `/admin/metrics` API
- [ ] Uptime check endpoint + external monitor setup
- [ ] Alert thresholds configured
- [ ] rrweb session recording client (`src/client/recording.js`) — masked, self-hosted
- [ ] `ui_heatmap_events` table + ingest endpoint (`/api/telemetry/session`)
- [ ] Admin heatmap viewer (click frequency overlay on Builder screenshot)

### Phase 4 — Hosted publishing (1–2 weeks)
- [ ] `published_pages` table + publish/unpublish routes
- [ ] Export pipeline on server (same as client export, run server-side)
- [ ] Upload generated HTML/assets to S3
- [ ] `tuify.app/{username}/{slug}` routing (nginx + server handler)
- [ ] "Publish" button in Builder toolbar
- [ ] User profile page (`tuify.app/{username}`)
- [ ] CDN cache invalidation on re-publish

### Phase 5 — User & platform stats dashboard (1 week)
- [ ] `world_stats`, `project_stats`, `platform_events` tables
- [ ] Increment stats on relevant events (play, export, publish, etc.)
- [ ] `/api/stats/*` endpoints
- [ ] Stats UI in the Builder sidebar (My Projects view)

### Phase 6 — Game export + Web Component (1–2 weeks)
- [ ] `vite.game.config.js` (library build)
- [ ] `TuifyGameElement` Web Component
- [ ] `hudExportRenderer.js` (port of `renderComponentExport`)
- [ ] `exportGame(worldId)` in App.jsx → downloads `{WorldName}.html`
- [ ] `/play/{username}/{slug}` server route (hosted full-page player)
- [ ] Worlds get a slug on save

### Phase 7 — GameEmbed component (1 week)
- [ ] `GameEmbed.jsx` component
- [ ] Toolbox registration (Builder mode)
- [ ] `exportHTML` handles `GameEmbed` → `<tuify-game>` in output
- [ ] `/api/games/:worldId/data` endpoint (lazy asset loading)

### Phase 8 — Anti-cheat & reward games (2 weeks)
- [ ] Server-side RNG for reward outcomes (slot machine, roulette, etc.)
- [ ] Provably fair commitment-reveal scheme
- [ ] `reward_spins` table + signed reward claim tokens
- [ ] `/api/rewards/spin` and `/api/rewards/redeem` endpoints
- [ ] Rate limiting + anomaly detection background job
- [ ] `rewardMode` world setting in Game Builder inspector
- [ ] External reward webhook support
- [ ] Multiplayer WSS + per-session HMAC message signing

### Phase 9 — Player data & leaderboards (1 week)
- [ ] `player_saves`, `leaderboard_entries` tables
- [ ] `/api/saves/:worldId`, `/api/leaderboard/:worldId` endpoints
- [ ] Anonymous session tokens
- [ ] GameRuntime `rt.save()` / `rt.loadSave()` / `rt.submitScore()` API
- [ ] Leaderboard HUD component in Game Builder toolbox

### Phase 10 — Multiplayer (2–3 weeks)
- [ ] WebSocket server with WSS + session HMAC signing
- [ ] `gameRoom.js` — room lifecycle + state broadcast
- [ ] `GameRuntime.setPlayerInput(slot, ...)` + server-side tick
- [ ] Client WebSocket in `tuify-game.js`
- [ ] Session creation/join UI
- [ ] `/api/sessions` endpoints

### Phase 11 — Wallet & token economy (2 weeks)
- [ ] Solana wallet connect (Phantom / Solflare / Backpack via wallet-adapter)
- [ ] Wallet ownership verification (sign-a-nonce, no transaction required)
- [ ] USDT (SPL) deposit monitoring via Solana RPC
- [ ] SOL deposit flow + price oracle integration
- [ ] `payment_history` table + atomic credit operations
- [ ] "Add Credits" UI modal in Builder
- [ ] `/api/wallet/*` endpoints (balance, deposit intent, verify)
- [ ] Agent balance + spend API (`/api/agent/wallet/*`)
- [ ] Credit spend deduction in game join / tournament buy-in flows

### Phase 12 — Agent API + MCP server (2 weeks)
- [ ] `agent_api_keys` table + key management UI (Agent Monitor tab)
- [ ] `agents.tuify.app` domain routing (separate from `api.tuify.app`)
- [ ] `/api/agent/*` route group with agent auth + scoped rate limits
- [ ] `identifyPrincipal` middleware (human vs agent traffic)
- [ ] HMAC body signing support for high-value operations
- [ ] Open Claw request signature verification (`OPENCLAW_PUBLIC_KEY`)
- [ ] Agent game room join via `wss://agents.tuify.app/ws/game`
- [ ] Agent tournament participation (agents can enter and play)
- [ ] `@tuify/mcp` npm package (MCP server wrapping agent API)
- [ ] Python SDK (`tuify-sdk`) and Node SDK (`@tuify/sdk`)
- [ ] Open Claw integration docs + example

### Phase 12 — Shadcn/UI bridge (2 weeks)
- [ ] Component mapping table (shadcn → TUIFY)
- [ ] Missing TUIFY components: Badge, Avatar, Progress, Slider, Tabs, Dialog, Toast, Table, Accordion, SideDrawer, Separator, Skeleton, ScrollContainer, RadioGroup, Combobox, Breadcrumb, Pagination, Alert, HoverCard (priority order)
- [ ] `shadcnToTuify()` conversion function + AST parser
- [ ] `tuifyToShadcn()` JSX export mode
- [ ] Import panel in Builder (paste shadcn code → get TUIFY screen)
- [ ] MCP tool: `shadcn_to_tuify`

### Phase 13 — LLM integration (2 weeks)
- [ ] LLM provider abstraction (`src/server/llm/index.js`)
- [ ] LLM config UI in Builder settings (provider, key, model)
- [ ] `llm_usage` table + per-user token limits
- [ ] `/api/llm/entity-chat` (streamed NPC dialogue)
- [ ] `/api/llm/generate-screen` (screen from description)
- [ ] `/api/llm/generate-entity-behavior` (behavior rule generation)
- [ ] GameEntity `aiEnabled` / `persona` props in Inspector
- [ ] AI GameEntity activation in GameRuntime

### Phase 14 — React export + `.tuify.json` (1–2 weeks)
- [ ] `renderComponentToJSX()` function in App.jsx
- [ ] `Export → JSX` button in toolbar
- [ ] `Export → ZIP` (all screens)
- [ ] `.tuify.json` schema definition + JSON Schema file
- [ ] `Import Screen` (load `.tuify.json` into project)
- [ ] `@tuify/react` package (extracted components + TuifyScreen renderer)
- [ ] CLI tool (`npx tuify pull/watch`)

### Phase 15 — Tournaments (2 weeks)
- [ ] Tournament tables in DB
- [ ] `/api/tournaments` CRUD + submit endpoint
- [ ] Real-time tournament leaderboard via WebSocket
- [ ] Tournament creation UI in Game Builder
- [ ] Bracket format (requires Phase 10 multiplayer)

### Phase 16 — Figma plugin (2–3 weeks, separate project)
- [ ] Figma plugin sandbox code (traverses frames → `.tuify.json`)
- [ ] Plugin UI (preview + download / send to TUIFY)
- [ ] `/api/agent/import/nano-json` endpoint (receive from plugin)
- [ ] Component name heuristics for Figma → TUIFY mapping

### Phase 17 — Platform features (ongoing)
- [ ] Public game gallery (`/games`)
- [ ] Embed code generator UI
- [ ] TypeScript type generation for JSX export
- [ ] Storybook story generation
- [ ] Mobile/touch input in GameRuntime
- [ ] Sound system (Web Audio API)
- [ ] Custom domains for published pages (requires DNS infrastructure)

---

## Summary (updated)

| Decision | Choice | Reason |
|---|---|---|
| **Platform name** | TUIFY — tuify.app | — |
| **Infrastructure provider** | tiffanyatyc.com | PostgreSQL + Redis + MinIO + Docker in one |
| Storage (DB) | PostgreSQL | Multi-user, concurrent writes, real-time |
| Storage (files) | S3-compatible (tiffanyatyc MinIO) | CDN-friendly, assets uploaded at build time |
| Cache / pub-sub | Redis | Rate limits, session cache, game room state across instances |
| Auth | JWT + httpOnly cookie + X (Twitter) + Google OAuth | Secure; X for identity sync |
| Game element tag | `<tuify-game>` | TUIFY-branded, no conflicts on multi-game pages |
| Game runtime file | `tuify-game.js` | Served from `tuify.app` |
| Game export file | `{WorldName}.html` | Named after the game |
| Hosted publishing | `tuify.app/username/slug` | Only `index.html` uploaded at publish; assets already in S3 |
| Multiplayer modes | Human vs Human, Human vs Agent, Agent vs Agent | Open Claw agents fully supported |
| Multiplayer security | Server-authoritative WSS + HMAC + Redis pub-sub | Scales across app instances |
| Agent domain | `agents.tuify.app` | Isolated routing; no HTML, JSON-only |
| Agent auth | API keys + scopes + HMAC body signing | `tuify_agent_...` key format |
| Agent protocol | REST + MCP (`@tuify/mcp`) + Python/Node SDKs | Covers LLM tools, CI, Open Claw |
| Reward games (slots, etc.) | Server-side RNG + signed claims + provably fair | Client can't influence outcomes |
| Anti-cheat | Server authority + anomaly detection + rate limits | No client-side trust |
| Payments | Solana wallet + USDT (SPL) → TUIFY credits | Crypto in, internal credits only |
| Prize distribution | TUIFY credits only | No direct crypto payouts — regulatory safety |
| HUD in export | `renderComponentExport()` reuse | Already exists, no rewrite |
| React export | JSX + `@tuify/react` package | Quick-export and live-sync users |
| Schema format | `.tuify.json` standard | Bidirectional: Builder ↔ React ↔ Figma ↔ Agent |
| Shadcn bridge | Bootstrap MCP import + mapping table | All shadcn components in toolbox after one run |
| Missing shadcn | 20+ components to build (Badge, Tabs, Dialog…) | Covers > 95% of typical shadcn usage |
| LLM integration | Model-agnostic OpenAI-compat API | OpenAI, Anthropic, Groq, Ollama, custom |
| AI GameEntities | Server-side streamed LLM with `persona` props | NPC dialogue + behavior generation |
| Figma plugin | Bidirectional Figma ↔ TUIFY via `.tuify.json` | Import design AND export back to Figma |
| Session recording | rrweb self-hosted | Heatmaps, rage clicks, Builder UX analysis |
| Logging | Pino → Loki / Datadog | Structured, fast, Grafana-compatible |
| Metrics | Prometheus + Grafana (agent, reward, payment RUM) | Full observability |
| Error tracking | Sentry | Server + browser error capture |
| Analytics | Platform events + daily rollup (11a–11g) | No third-party data leakage |
| Tournaments | Leaderboard + bracket + agent participants | Agents can enter with credits |
| Anonymous players | `tuify_anon_id` UUID, claimable on register | Play without account |
