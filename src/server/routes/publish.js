import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isAvailable } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { generateGameHtml, generatePageHtml, generateCombinedHtml } from '../lib/gameExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publishedDir = path.resolve(__dirname, '../../../published');

export const publishRouter = express.Router();

// Reserved usernames / slugs that can't be used
const RESERVED = new Set(['api', 'play', 'admin', 'games', 'apps', 'help', 'pricing', 'blog', 'runtime', 'uploads', 'static']);

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

function validSlug(s) {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(s) && !RESERVED.has(s);
}

// Derive a stable username from a user row (email prefix, slug-safe, unique ensured at publish)
function deriveUsername(user) {
  if (user.username) return user.username;
  const base = slugify(user.display_name || user.email.split('@')[0]);
  return base || 'user';
}

function ensurePublishedDir(userId, slug) {
  const dir = path.join(publishedDir, userId, slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function serverOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ─── GET /api/publish/check-slug/:slug ────────────────────────────────────────
// Returns { available: true } or { available: false, reason }
publishRouter.get('/check-slug/:slug', requireAuth, async (req, res) => {
  const slug = req.params.slug;
  if (!validSlug(slug)) return res.json({ available: false, reason: 'Invalid slug — use 3–64 lowercase letters, numbers, or hyphens' });
  if (!await isAvailable()) return res.json({ available: true }); // can't check without DB
  const userId = req.user.userId;
  const { rows } = await query('SELECT id FROM published_pages WHERE owner_id = $1 AND slug = $2', [userId, slug]);
  res.json({ available: rows.length === 0 });
});

// ─── GET /api/publish/list ────────────────────────────────────────────────────
publishRouter.get('/list', requireAuth, async (req, res) => {
  if (!await isAvailable()) return res.json([]);
  const { rows } = await query(
    `SELECT id, slug, title, description, is_public, published_at, updated_at, visit_count, world_id, source_id, publish_mode
     FROM published_pages WHERE owner_id = $1 ORDER BY updated_at DESC`,
    [req.user.userId]
  );
  // Attach the public URL to each row
  const { rows: userRows } = await query('SELECT username, email, display_name FROM users WHERE id = $1', [req.user.userId]);
  const username = deriveUsername(userRows[0] || { email: req.user.email });
  const origin = serverOrigin(req);
  res.json(rows.map(r => ({ ...r, url: `${origin}/${username}/${r.slug}` })));
});

// ─── POST /api/publish ────────────────────────────────────────────────────────
// Body: { sourceId, worldId?, slug, title, description, isPublic, publishMode, pageHtml? }
// publishMode: 'page' | 'game' | 'page+game'  (default: 'game' for back-compat)
publishRouter.post('/', requireAuth, async (req, res) => {
  try {
    const { sourceId, worldId, slug, title, description, isPublic = true, publishMode = 'game', pageHtml } = req.body || {};
    if (!sourceId) return res.status(400).json({ error: 'sourceId required' });
    if (!slug)     return res.status(400).json({ error: 'slug required' });
    if (!validSlug(slug)) return res.status(400).json({ error: 'Invalid slug — use 3–64 lowercase letters, numbers, or hyphens' });

    const needsGame = publishMode === 'game' || publishMode === 'page+game';
    const needsPage = publishMode === 'page' || publishMode === 'page+game';

    if (needsPage && !pageHtml) return res.status(400).json({ error: 'pageHtml required for page/page+game modes' });

    if (!await isAvailable()) return res.status(503).json({ error: 'Database required for publishing' });

    const userId = req.user.userId;

    // Find project — try owner-scoped first, then fall back to any project the
    // authenticated user can access (handles admin-owned projects in single-user mode).
    let projRows;
    ({ rows: projRows } = await query(
      'SELECT data, assets_json FROM projects WHERE id = $1 AND owner_id = $2',
      [sourceId, userId]
    ));
    if (!projRows.length) {
      if (req.user.role === 'admin') {
        ({ rows: projRows } = await query(
          'SELECT data, assets_json FROM projects WHERE id = $1',
          [sourceId]
        ));
      }
    }
    if (!projRows.length) return res.status(404).json({ error: 'Project not found' });

    const projectData = projRows[0].data;
    const assetsData  = projRows[0].assets_json || { sprites: [], tilesets: [], sounds: [], backgrounds: [] };

    // Collect ALL worlds — a game is the full set of worlds in the project,
    // the same way a page export includes all page screens.
    let worlds = null;
    if (needsGame) {
      worlds = (projectData.screens || []).filter(s => s.kind === 'world');
      if (!worlds.length) return res.status(400).json({ error: 'Project has no worlds' });
      if (!worlds.some(w => w.levels?.length > 0)) return res.status(400).json({ error: 'No worlds with levels found' });
    }

    // Check slug uniqueness (allow re-publish of same slug by same user)
    const { rows: existing } = await query(
      'SELECT id FROM published_pages WHERE owner_id = $1 AND slug = $2',
      [userId, slug]
    );

    // Generate and store HTML
    const origin = serverOrigin(req);
    const dir = ensurePublishedDir(userId, slug);
    const htmlPath = path.join(dir, 'index.html');
    const resolvedTitle = title || worlds?.[0]?.name || 'Untitled';

    if (publishMode === 'game') {
      fs.writeFileSync(htmlPath, generateGameHtml({ worlds, assets: assetsData, title: resolvedTitle, description, origin }), 'utf-8');
    } else if (publishMode === 'page') {
      fs.writeFileSync(htmlPath, generatePageHtml({ pageHtml, origin }), 'utf-8');
    } else { // page+game
      fs.writeFileSync(htmlPath, generateCombinedHtml({ pageHtml, worlds, assets: assetsData, title: resolvedTitle, description, origin }), 'utf-8');
    }

    // Upsert published_pages record (world_id is null for game mode — the game is all worlds)
    if (existing.length) {
      await query(
        `UPDATE published_pages SET title=$1, description=$2, is_public=$3, html_path=$4,
         updated_at=now(), world_id=$5, source_id=$6, publish_mode=$7
         WHERE owner_id=$8 AND slug=$9`,
        [resolvedTitle, description || null, isPublic, htmlPath, null, sourceId, publishMode, userId, slug]
      );
    } else {
      await query(
        `INSERT INTO published_pages (owner_id, source_id, world_id, slug, title, description, is_public, html_path, publish_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, sourceId, null, slug, resolvedTitle, description || null, isPublic, htmlPath, publishMode]
      );
    }

    // Persist username on user record (for URL generation)
    const { rows: userRows } = await query('SELECT username, email, display_name FROM users WHERE id = $1', [userId]);
    const user = userRows[0];
    if (!user.username) {
      let uname = deriveUsername(user);
      const { rows: taken } = await query('SELECT id FROM users WHERE username = $1', [uname]);
      if (taken.length) uname = `${uname}-${userId.slice(0, 6)}`;
      await query('UPDATE users SET username = $1 WHERE id = $2', [uname, userId]);
      user.username = uname;
    }

    const url = `${origin}/${user.username}/${slug}`;
    res.json({ success: true, url, username: user.username, slug });
  } catch (err) {
    console.error('[publish] POST error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Publish failed' });
  }
});

// ─── DELETE /api/publish/:slug ────────────────────────────────────────────────
publishRouter.delete('/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;
  if (!await isAvailable()) return res.status(503).json({ error: 'Database required' });
  const userId = req.user.userId;
  const { rows } = await query(
    'DELETE FROM published_pages WHERE owner_id = $1 AND slug = $2 RETURNING html_path',
    [userId, slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  // Remove HTML file
  const htmlPath = rows[0].html_path;
  if (htmlPath && fs.existsSync(htmlPath)) {
    fs.rmSync(path.dirname(htmlPath), { recursive: true, force: true });
  }
  res.json({ success: true });
});

// ─── PUT /api/publish/:slug/settings ─────────────────────────────────────────
publishRouter.put('/:slug/settings', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { title, description, isPublic } = req.body || {};
  if (!await isAvailable()) return res.status(503).json({ error: 'Database required' });
  const { rowCount } = await query(
    `UPDATE published_pages SET title=COALESCE($1,title), description=COALESCE($2,description),
     is_public=COALESCE($3,is_public), updated_at=now()
     WHERE owner_id=$4 AND slug=$5`,
    [title ?? null, description ?? null, isPublic ?? null, req.user.userId, slug]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});
