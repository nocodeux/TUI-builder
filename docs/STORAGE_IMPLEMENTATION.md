# TUIFY — Storage & Database Implementation Guide

**Status:** In progress  
**Last updated:** 2026-05-13  
**Branch:** feature/game-builder  
**Purpose:** Source of truth for the storage and database migration. Every phase documents exact files changed, commands to run, how to test, and how to rollback.

---

## 1. Current state — what exists today

### Persistence layer

Everything runs through a **Vite plugin middleware** in `vite.config.js` (~160 lines). This only works in Vite dev mode. In production builds it does not exist.

| What | Where stored | Format |
|---|---|---|
| Projects | `projects/{id}.json` (disk) | JSON — full project object incl. screens |
| Game assets | `projects/{id}.assets.json` (disk) | JSON — sprites/tilesets/sounds with **base64 data URLs** inline |
| Settings | `settings.json` (project root) | JSON — builderName, apiKey, apiUrl |

### The base64 problem

Every sprite, tileset, background, and sound is encoded as a base64 string and stored directly inside the JSON file. A 512×512 PNG becomes ~350 KB of text. A project with 10 sprites is 3–5 MB of JSON being sent over the network on every auto-save.

### API surface (what the frontend calls today)

```
GET    /api/projects                  → list projects
GET    /api/projects/:id              → load project JSON
POST   /api/projects                  → save project JSON
DELETE /api/projects/:id              → delete project + assets sidecar
GET    /api/projects/:id/assets       → load assets sidecar (base64 blobs inside)
POST   /api/projects/:id/assets       → save assets sidecar
DELETE /api/projects/:id/assets       → delete assets sidecar
GET    /api/settings                  → load settings
POST   /api/settings                  → save settings
```

All 11 `fetch()` calls in `src/App.jsx` use these URLs directly. They do not change until Phase 5 (auth adds Authorization headers).

---

## 2. Upload inventory — all places that write files

### Category A — Game assets (SpriteSheetManager) → will go to S3

These images are part of the game content. They are uploaded once and reused across levels.

| File | Line | What | Stored in |
|---|---|---|---|
| `SpriteSheetManager.jsx` | 664 | Import sprite sheet | `assets.sprites[n].src` |
| `SpriteSheetManager.jsx` | 778 | Update sprite sheet image | `assets.sprites[n].src` |
| `SpriteSheetManager.jsx` | 952 | Import tileset | `assets.tilesets[n].src` |
| `SpriteSheetManager.jsx` | 1055 | Update tileset image | `assets.tilesets[n].src` |
| `SpriteSheetManager.jsx` | 1178 | Import background | `assets.backgrounds[n].src` |
| `SpriteSheetManager.jsx` | 1225 | Update background image | `assets.backgrounds[n].src` |
| `SpriteSheetManager.jsx` | 1247 | Import sound | `assets.sounds[n].src` |

All 7 use `readFileAsDataUrl(file)` → returns `data:image/...;base64,...` string.

### Category B — Component props (Inspector + Image component) → will go to S3

These images are properties of individual UI components on a screen. They are stored inside the project JSON as component props.

| File | Line | What | Stored in |
|---|---|---|---|
| `Inspector.jsx` | 1858–1862 | Background image of Window/Container | `component.props.bgImage` (inside `screens[].rows[].children[].props`) |
| `Inspector.jsx` | 2214–2230 | `src` prop of Image component | `component.props.src` (same location) |

These are embedded in the project JSON itself (not in the assets sidecar). After Phase 3 they will store URLs instead of base64 strings.

### Category C — Runtime form uploads (Image + Button) → different flow

These are not project assets. They are form inputs at runtime — a user submitting data in a deployed app.

| File | Line | What | Stored in |
|---|---|---|---|
| `Componentes/Image.jsx` | 46–53 | User uploads image into a form | `formContext.updateField(dataField, base64)` |
| `Componentes/Button.jsx` | 56–64 | User uploads file via button | `formContext.updateField(dataField, base64)` |

These stay as-is for now — they are transient form state, not persistent project content. When the database panel gets a proper backend, these will POST to a `project_data` table.

### Not an upload — `URL.createObjectURL` uses

| File | Line | What | Action needed |
|---|---|---|---|
| `SpriteSheetManager.jsx` | 144 | Create temporary blob URL for GIF export preview | **None** — creates temporary in-memory URL, not persisted |
| `App.jsx` | 1861 | Create download URL for GIF export | **None** — same |
| `DatabasePanel.jsx` | 180 | CSV export download | **None** — same |

---

## 3. Architecture target

```
Browser                         Server (tiffanyatyc.com)         Storage
──────────────────              ──────────────────────           ──────────────────
Builder UI (React)        →     Express (src/server/)        →   PostgreSQL (projects, assets metadata)
                          →     /api/assets/upload           →   MinIO / S3 (actual files)
Game Runtime (JS)         →     WebSocket game rooms         →   Redis (pub-sub, rate limits)
```

### URL strategy

- `fetch('/api/projects')` etc. — same URLs throughout all phases (zero frontend change until Phase 5)
- Asset `src` field changes from `"data:image/png;base64,..."` → `"https://cdn.tuify.app/assets/{id}.png"`
  - `<img src>` accepts both — rendering code requires **zero changes**
  - Export HTML needs a fetch-and-encode step for offline capability

### New files by end of all phases

```
src/
  server/
    index.js                ← Express entry point
    routes/
      projects.js           ← /api/projects/* 
      settings.js           ← /api/settings
      assets.js             ← /api/assets/upload, /api/assets/:id
    db/
      index.js              ← pg Pool + query helper
      schema.sql            ← CREATE TABLE statements
      migrate.js            ← filesystem → PostgreSQL migration
      migrateAssetsToS3.js  ← base64 in DB → S3 migration
    storage/
      index.js              ← driver selector: local vs s3
      localDriver.js        ← disk-based (dev, simple deploy)
      s3Driver.js           ← S3-compatible (production)
  lib/
    assetUpload.js          ← uploadAsset(file) → {url, assetId}  [used by frontend]
docker-compose.yml
.env.example
```

### Modified files by end of all phases

```
package.json                              ← +express +cors +pg +@aws-sdk/client-s3 +multer +dotenv
vite.config.js                            ← proxy /api → Express; remove Vite middleware
src/App.jsx                               ← export function: fetch CDN assets for offline HTML
src/components/SpriteSheetManager.jsx     ← 7 readFileAsDataUrl → uploadAsset()
src/components/Inspector.jsx              ← 2 FileReader → uploadAsset()
```

---

## 4. Phase 1 — Express server (replaces Vite plugin)

**Goal:** Production-safe API server with the same behavior as today. Zero data model changes.  
**Risk:** LOW — if Express fails, Vite plugin is the fallback.  
**Frontend changes:** NONE.

### 4a. New dependencies

```bash
npm install express cors dotenv
npm install -D nodemon concurrently
```

### 4b. Files created

**`src/server/index.js`**
```js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { projectsRouter } from './routes/projects.js';
import { settingsRouter } from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3001' }));
app.use(express.json({ limit: '50mb' }));  // base64 payloads are large

app.use('/api/projects', projectsRouter);
app.use('/api/settings', settingsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// In production: serve built React app
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`TUIFY server running on :${PORT}`));
```

**`src/server/routes/projects.js`**  
Exact same logic as the Vite plugin middleware, refactored into Express Router. Reads/writes `projects/*.json` and `projects/*.assets.json`. No logic changes — same filesystem, same JSON format.

**`src/server/routes/settings.js`**  
Reads/writes `settings.json`. Same as Vite plugin.

### 4c. Vite config change

Remove the middleware plugin from `vite.config.js`. Add a dev server proxy so `fetch('/api/...')` in the browser goes to Express:

```js
// vite.config.js — dev proxy (replaces configureServer middleware)
server: {
  port: 3001,
  open: true,
  proxy: {
    '/api': {
      target: 'http://localhost:3002',
      changeOrigin: true,
    }
  }
}
```

### 4d. New npm scripts

```json
"scripts": {
  "dev": "vite",
  "server": "nodemon src/server/index.js",
  "dev:full": "concurrently \"npm run server\" \"npm run dev\"",
  "build": "vite build",
  "start": "NODE_ENV=production node src/server/index.js"
}
```

### 4e. How to run in dev

```bash
npm run dev:full
# Terminal 1: Express on :3002
# Terminal 2: Vite on :3001, proxies /api → :3002
```

### 4f. Test checklist

- [ ] Open app — project list loads
- [ ] Create new project — auto-save works
- [ ] Load existing project — screens render correctly
- [ ] Upload a sprite in SpriteSheetManager — saves to `projects/{id}.assets.json`
- [ ] Delete a project — file removed from disk
- [ ] Settings save/load — `settings.json` read and written
- [ ] Run `npm run build && npm start` — production mode works
- [ ] `GET /health` returns 200

### 4g. Rollback

If something breaks: revert `vite.config.js` to restore the `configureServer` middleware. Express server is additive — the Vite middleware still exists until we delete it.

---

## 5. Phase 2 — PostgreSQL for project data

**Goal:** Projects survive beyond the local filesystem. Works in multi-server deployments.  
**Risk:** MEDIUM — data migration. Mitigation: idempotent script + backup before running.  
**Frontend changes:** NONE.

### 5a. New dependencies

```bash
npm install pg
```

### 5b. Files created

**`src/server/db/schema.sql`**  
Full DDL — see Platform Architecture doc. Key tables for this phase:
- `projects` — id, name, owner_id (null until Phase 5), screens JSONB, database_content JSONB, assets_json JSONB (temporary), last_saved, created_at
- `settings` — id, key, value (simple key-value table for global settings)

**`src/server/db/index.js`**  
`pg.Pool` singleton + `query(sql, params)` helper. Reads `DATABASE_URL` from env.

**`src/server/db/migrate.js`**  
Reads all `projects/*.json` and `projects/*.assets.json` → INSERT into DB. Idempotent (`ON CONFLICT (id) DO NOTHING`). Logs each migrated project.

### 5c. Files modified

**`src/server/routes/projects.js`**  
Switch from `fs.readFileSync/writeFileSync` to `db.query()`. Same request/response contracts.

**`src/server/routes/settings.js`**  
Switch from `settings.json` file to `settings` table.

### 5d. Migration procedure (run once)

```bash
# 1. Backup filesystem (REQUIRED before running)
cp -r projects/ projects_backup_$(date +%Y%m%d)

# 2. Ensure PostgreSQL is running (docker-compose or tiffanyatyc)
docker-compose up -d db

# 3. Run schema creation
psql $DATABASE_URL < src/server/db/schema.sql

# 4. Run data migration
node src/server/db/migrate.js

# 5. Verify (must equal number of .json files in projects/)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM projects"
```

### 5e. Test checklist

- [ ] All projects visible after migration (same count as before)
- [ ] Open a project — data matches what was in the `.json` file
- [ ] Auto-save writes to PostgreSQL (verified via `SELECT` after saving)
- [ ] Create new project — appears in DB
- [ ] Delete project — row removed from DB
- [ ] Assets still load (they're in `assets_json JSONB` column for now)
- [ ] `projects/` folder can be renamed/removed and everything still works

### 5f. Activating Phase 2 (when Docker is available)

```bash
# 1. Start PostgreSQL
docker compose up postgres -d

# 2. Wait for healthy, then run migration
DATABASE_URL=postgresql://tuify:tuifydev@localhost:5432/tuify npm run db:migrate

# 3. Run server with DB enabled
DATABASE_URL=postgresql://tuify:tuifydev@localhost:5432/tuify npm run dev:full

# Server will log: [db] PostgreSQL connected ✓
```

Without `DATABASE_URL`: server logs `[db] No DATABASE_URL — using filesystem storage` and falls back to `projects/*.json` files. Zero changes needed in the frontend or routes.

### 5g. Rollback

```bash
# Stop using DB: just unset DATABASE_URL. Routes fall back to filesystem automatically.
# The projects_backup_* folder still has all original data.
```

---

## 6. Phase 3 — S3 for asset files

**Goal:** Asset files live in S3. No more base64 in JSON. `src` fields become CDN URLs.  
**Risk:** MEDIUM-HIGH — changes frontend upload flow.  
**Frontend changes:** SpriteSheetManager.jsx (7), Inspector.jsx (2).

This phase has 4 sequential sub-steps.

### 6a. S3 driver and upload endpoint

**New files:**
- `src/server/storage/index.js` — driver selector
- `src/server/storage/localDriver.js` — disk-based (dev)
- `src/server/storage/s3Driver.js` — AWS SDK v3, S3-compatible
- `src/server/routes/assets.js` — `POST /api/assets/upload` (multipart), `GET /api/assets/:id`

**Modified:**
- `src/server/index.js` — mount assets router
- `package.json` — add `@aws-sdk/client-s3`, `multer`
- `.env` — add S3 vars (see below)

**New env vars:**
```
STORAGE_DRIVER=local                   # local | s3
STORAGE_PATH=./uploads                 # local driver
AWS_ENDPOINT_URL=                      # blank = AWS; set for MinIO/R2
AWS_BUCKET=tuify-assets
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CDN_BASE_URL=https://cdn.tuify.app     # public URL prefix
```

**Upload endpoint contract:**
```
POST /api/assets/upload
Content-Type: multipart/form-data
Body: file (binary), type (sprite|tileset|background|sound), projectId (optional)

Response: { url: "https://cdn.tuify.app/assets/{id}.png", assetId: "{uuid}", key: "assets/..." }
```

No frontend changes yet in this sub-step.

### 6b. Frontend upload helper

**New file: `src/lib/assetUpload.js`**

```js
// Single function used by all 9 upload points (Category A + B)
export async function uploadAsset(file, type = 'image') {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);
  const res = await fetch('/api/assets/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json(); // { url, assetId }
}
```

### 6c. Change upload flow in SpriteSheetManager (7 points)

**Modified: `src/components/SpriteSheetManager.jsx`**

Before (all 7 points look like this):
```js
const src = await readFileAsDataUrl(file);
const sheet = { id, name: file.name, src, frame: {...} };
```

After:
```js
const { url, assetId } = await uploadAsset(file, 'sprite');
const sheet = { id, name: file.name, src: url, assetId, frame: {...} };
```

The `readFileAsDataUrl` function is kept as an internal fallback (not removed) since it's used in GIF export preview (line 144 via `URL.createObjectURL(blob)` — different code path).

### 6d. Change upload flow in Inspector (2 points)

**Modified: `src/components/Inspector.jsx`**

Inspector line ~1858 (bgImage):
```js
// Before:
const reader = new FileReader();
reader.onload = (ev) => updateAndCommit('bgImage', ev.target.result);
reader.readAsDataURL(file);

// After:
uploadAsset(file, 'image').then(({ url }) => updateAndCommit('bgImage', url));
```

Inspector line ~2214 (Image src):
```js
// Before:
const reader = new FileReader();
reader.onload = (ev) => {
  const res = ev.target.result;
  updateAndCommit('src', res);
  const img = new window.Image();
  img.onload = () => { ... updateAndCommit('width', img.width); ... };
  img.src = res;
};
reader.readAsDataURL(file);

// After:
const { url } = await uploadAsset(file, 'image');
updateAndCommit('src', url);
// Load image to get dimensions (same as before, just using URL)
const img = new window.Image();
img.onload = () => {
  if (img.width > 4 && img.height > 4) {
    updateAndCommit('aspectRatio', img.width / img.height);
    updateAndCommit('width', img.width);
    updateAndCommit('height', img.height);
  }
};
img.src = url;
```

### 6e. Adapt export HTML for CDN assets

The standalone HTML export currently uses base64 already in memory. After Phase 3, `assets.sprites[n].src` is a CDN URL. The export needs to fetch and re-encode for true offline support.

**Modified: `src/App.jsx`** — export function only:

```js
// Helper added to export section:
async function srcToDataUrl(src) {
  if (!src || src.startsWith('data:')) return src; // already base64
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return src; } // fallback: use URL (requires internet to play)
}
```

Called when building the game bundle for standalone HTML export.

### 6f. Migrate existing base64 to S3

Existing projects in DB have `assets_json` with base64 strings. This script uploads them to S3 and replaces with URLs.

**New file: `src/server/db/migrateAssetsToS3.js`**

```
node src/server/db/migrateAssetsToS3.js
```

Safety protocol before running:
1. `pg_dump $DATABASE_URL > backup_pre_s3_$(date +%Y%m%d).sql`
2. Run on staging / a copy first
3. Verify a project with `SELECT assets_json->>'sprites' FROM projects LIMIT 1`

### 6g. Test checklist for Phase 3

- [ ] Upload a new sprite — DevTools shows `assets.sprites[0].src` is `https://cdn.tuify.app/...`
- [ ] Sprite renders in canvas (confirms `<img src=url>` works)
- [ ] Upload tileset, background, sound — all return CDN URLs
- [ ] Upload background image in Inspector — `props.bgImage` is CDN URL
- [ ] Upload image `src` in Inspector — `props.src` is CDN URL, width/height auto-detected
- [ ] Export HTML (standalone) — open HTML file offline, game assets render
- [ ] Open old project (migrated) — sprites load from CDN
- [ ] Auto-save after Phase 3 — no base64 strings in saved project JSON

### 6h. Rollback

The `uploadAsset()` call can be wrapped to fall back to `readFileAsDataUrl()` if server returns non-200. This means a broken upload endpoint degrades gracefully — the old base64 behavior kicks in. Remove the fallback once the endpoint is verified stable.

---

## 7. Phase 4 — Assets table (metadata normalization)

**Goal:** Move per-project `assets_json JSONB` to a proper `assets` table. Assets become addressable by UUID. Shared across projects by the same owner.  
**Risk:** LOW (S3 already has the files, only DB schema changes).  
**Frontend changes:** NONE.

Key schema change:
```sql
CREATE TABLE assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID,           -- null until Phase 5
  project_id   UUID REFERENCES projects(id),
  type         TEXT NOT NULL,  -- sprite | tileset | sound | background | image
  name         TEXT NOT NULL,
  storage_key  TEXT NOT NULL,  -- S3 key
  cdn_url      TEXT NOT NULL,
  frame_meta   JSONB,          -- SpriteSheetManager frame data
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

Migration script reads `projects.assets_json` → inserts into `assets` table. Project routes updated to JOIN with assets on load.

---

## 8. Phase 5 — Auth & multi-user

**Goal:** User accounts. All data scoped to `req.user.id`.  
**Risk:** MEDIUM (adds JWT middleware, changes all routes).  
**Frontend changes:** login modal, auth header on fetch calls.

- `POST /api/auth/register` — email + password
- `POST /api/auth/login` — returns JWT in httpOnly cookie
- `GET /api/auth/me`
- X (Twitter) OAuth: `GET /api/auth/x` + callback
- Google OAuth: `GET /api/auth/google` + callback
- All `/api/projects` routes add `WHERE owner_id = req.user.id`
- Migration: all existing projects assigned to first registered user (admin)

---

## 9. Environment variables reference

```bash
# === REQUIRED for Phase 1 ===
PORT=3002
NODE_ENV=development
CORS_ORIGINS=http://localhost:3001

# === Required for Phase 2 ===
DATABASE_URL=postgresql://tuify:password@localhost:5432/tuify

# === Required for Phase 3 ===
STORAGE_DRIVER=local           # local | s3
STORAGE_PATH=./uploads         # for local driver
AWS_ENDPOINT_URL=              # blank = AWS; set for tiffanyatyc MinIO
AWS_BUCKET=tuify-assets
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
CDN_BASE_URL=http://localhost:3002/uploads   # local dev
# CDN_BASE_URL=https://cdn.tuify.app        # production

# === Required for Phase 5 ===
JWT_SECRET=...
X_CLIENT_ID=
X_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

## 10. Docker compose (tiffanyatyc deployment target)

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["3002:3002"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://tuify:${DB_PASS}@postgres:5432/tuify
      - REDIS_URL=redis://redis:6379
      - STORAGE_DRIVER=s3
      - AWS_ENDPOINT_URL=${MINIO_URL}
      - AWS_BUCKET=tuify-assets
      - CDN_BASE_URL=${CDN_BASE_URL}
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tuify
      POSTGRES_USER: tuify
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

---

## 11. Progress tracker

| Phase | Status | Branch | Notes |
|---|---|---|---|
| Phase 1 — Express server | ✅ Done | feature/game-builder | All endpoints verified. `npm run dev:full` |
| Phase 2 — PostgreSQL | ✅ Code done | feature/game-builder | Needs Docker/PostgreSQL to activate. Set DATABASE_URL to enable. |
| Phase 3a — S3 driver | ⏳ Pending | — | Requires Phase 2 |
| Phase 3b — SpriteSheetManager | ⏳ Pending | — | Requires Phase 3a |
| Phase 3c — Inspector uploads | ⏳ Pending | — | Requires Phase 3a |
| Phase 3d — Export HTML fix | ⏳ Pending | — | Requires Phase 3a |
| Phase 3e — Base64 migration | ⏳ Pending | — | Requires Phase 3a |
| Phase 4 — Assets table | ⏳ Pending | — | Requires Phase 3 |
| Phase 5 — Auth | ⏳ Pending | — | Requires Phase 4 |
