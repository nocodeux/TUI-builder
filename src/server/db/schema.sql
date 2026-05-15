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

-- ─── Phase 5: Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         TEXT         UNIQUE NOT NULL,
  password_hash TEXT,                        -- null for OAuth-only accounts
  display_name  TEXT,
  avatar_url    TEXT,
  x_id          TEXT         UNIQUE,
  x_handle      TEXT,
  google_id     TEXT         UNIQUE,
  role          TEXT         NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

-- owner_id on projects (nullable — null = legacy / single-user mode)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- owner_id on assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id);

-- username: URL-safe handle, unique per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- ─── Phase 7: Published pages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS published_pages (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_id     TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id    TEXT         NOT NULL,   -- project id (contains the world)
  world_id     TEXT,                    -- screen id of the world (null for page-only publishes)
  slug         TEXT         NOT NULL,
  title        TEXT,
  description  TEXT,
  html_path    TEXT,                    -- filesystem path to stored HTML
  published_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  is_public    BOOLEAN      NOT NULL DEFAULT true,
  visit_count  BIGINT       NOT NULL DEFAULT 0,
  publish_mode TEXT         NOT NULL DEFAULT 'game',  -- page | game | page+game
  UNIQUE (owner_id, slug)
);
ALTER TABLE published_pages ADD COLUMN IF NOT EXISTS publish_mode TEXT NOT NULL DEFAULT 'game';
-- Make world_id nullable to support page-only publishes
ALTER TABLE published_pages ALTER COLUMN world_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_published_owner ON published_pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_published_slug  ON published_pages(owner_id, slug);
