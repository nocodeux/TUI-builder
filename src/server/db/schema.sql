-- TUIFY — PostgreSQL Schema
-- Phase 2: projects + settings
-- Phase 4: assets table (added later)
-- Phase 5: users (added later)

-- ─── Projects ─────────────────────────────────────────────────────────────────
-- id is TEXT (not UUID) because existing project IDs include both UUIDs and
-- custom strings (e.g. "blog-example"). We keep compatibility without migration.
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT         PRIMARY KEY,
  name        TEXT         NOT NULL DEFAULT 'Untitled',
  data        JSONB        NOT NULL DEFAULT '{}',
  assets_json JSONB        NOT NULL DEFAULT '{"sprites":[],"tilesets":[],"sounds":[],"backgrounds":[]}',
  last_saved  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_last_saved ON projects(last_saved DESC);

-- ─── Settings (key-value) ──────────────────────────────────────────────────────
-- key = 'global' for platform settings.
-- key = 'user:{id}' once auth is added (Phase 5).
CREATE TABLE IF NOT EXISTS settings_kv (
  key        TEXT   PRIMARY KEY,
  value      JSONB  NOT NULL DEFAULT '{}'
);

-- ─── Phase 4 additions (run when ready — safe to include now) ─────────────────
-- Assets are stub-created here but only populated in Phase 4.
-- Phase 3 still uses assets_json JSONB column above.
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT         REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL,       -- sprite | tileset | sound | background | image
  name        TEXT         NOT NULL,
  storage_key TEXT,                        -- S3 key (null until Phase 3)
  cdn_url     TEXT,                        -- CDN URL (null until Phase 3)
  frame_meta  JSONB,                       -- frame grid, animations, transparent color
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
