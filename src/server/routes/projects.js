import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isAvailable } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectsDir = path.resolve(__dirname, '../../../projects');

export const projectsRouter = express.Router();

// ─── Storage drivers ─────────────────────────────────────────────────────────
// useDb() checks once per request if the DB is configured and reachable.
// If not, all operations fall back to the filesystem (Phase 1 behaviour).
// This lets Phase 1 and Phase 2 coexist: just set DATABASE_URL to upgrade.

async function useDb() {
  return isAvailable();
}

function ensureDir() {
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });
}

// ─── List projects ────────────────────────────────────────────────────────────
projectsRouter.get('/', async (_req, res) => {
  try {
    if (await useDb()) {
      const { rows } = await query(
        `SELECT id, name, last_saved AS "lastSaved"
         FROM projects
         ORDER BY last_saved DESC`
      );
      return res.json(rows);
    }
    // Filesystem fallback
    ensureDir();
    const files = fs.readdirSync(projectsDir);
    const projects = files
      .filter(f => f.endsWith('.json') && !f.endsWith('.assets.json'))
      .map(f => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(projectsDir, f), 'utf-8'));
          return { id: p.id, name: p.name || 'Untitled', lastSaved: p.lastSaved || new Date().toISOString() };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastSaved) - new Date(a.lastSaved));
    res.json(projects);
  } catch (err) {
    console.error('[projects] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// ─── Load project ─────────────────────────────────────────────────────────────
projectsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (await useDb()) {
      const { rows } = await query('SELECT data FROM projects WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Project not found' });
      return res.json(rows[0].data);
    }
    // Filesystem fallback
    const filePath = path.join(projectsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch (err) {
    console.error('[projects] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Load assets sidecar ──────────────────────────────────────────────────────
projectsRouter.get('/:id/assets', async (req, res) => {
  const { id } = req.params;
  const empty = { sprites: [], tilesets: [], sounds: [], backgrounds: [] };
  try {
    if (await useDb()) {
      const { rows } = await query('SELECT assets_json FROM projects WHERE id = $1', [id]);
      return res.json(rows.length ? (rows[0].assets_json || empty) : empty);
    }
    // Filesystem fallback
    ensureDir();
    const filePath = path.join(projectsDir, `${id}.assets.json`);
    res.json(fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : empty);
  } catch (err) {
    console.error('[projects] GET /:id/assets error:', err.message);
    res.json(empty);
  }
});

// ─── Save project ─────────────────────────────────────────────────────────────
projectsRouter.post('/', async (req, res) => {
  const project = req.body;
  if (!project?.id) return res.status(400).json({ error: 'Project ID required' });
  try {
    if (await useDb()) {
      await query(
        `INSERT INTO projects (id, name, data, last_saved)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               data = EXCLUDED.data,
               last_saved = EXCLUDED.last_saved`,
        [
          project.id,
          project.name || 'Untitled',
          JSON.stringify(project),
          project.lastSaved ? new Date(project.lastSaved) : new Date(),
        ]
      );
      return res.json({ success: true });
    }
    // Filesystem fallback
    ensureDir();
    fs.writeFileSync(path.join(projectsDir, `${project.id}.json`), JSON.stringify(project, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('[projects] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Save assets sidecar ──────────────────────────────────────────────────────
projectsRouter.post('/:id/assets', async (req, res) => {
  const { id } = req.params;
  try {
    if (await useDb()) {
      // Upsert: if project row exists update assets_json; if not create a minimal row.
      // The project row should already exist from the POST /api/projects save, but
      // defensive upsert avoids a foreign-key issue if assets are saved first.
      await query(
        `INSERT INTO projects (id, name, data, assets_json)
         VALUES ($1, 'Untitled', '{}', $2)
         ON CONFLICT (id) DO UPDATE SET assets_json = EXCLUDED.assets_json`,
        [id, JSON.stringify(req.body)]
      );
      return res.json({ success: true });
    }
    // Filesystem fallback
    ensureDir();
    fs.writeFileSync(path.join(projectsDir, `${id}.assets.json`), JSON.stringify(req.body));
    res.json({ success: true });
  } catch (err) {
    console.error('[projects] POST /:id/assets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete assets sidecar ────────────────────────────────────────────────────
projectsRouter.delete('/:id/assets', async (req, res) => {
  const { id } = req.params;
  try {
    if (await useDb()) {
      const empty = { sprites: [], tilesets: [], sounds: [], backgrounds: [] };
      await query('UPDATE projects SET assets_json = $1 WHERE id = $2', [JSON.stringify(empty), id]);
      return res.json({ success: true });
    }
    // Filesystem fallback
    const filePath = path.join(projectsDir, `${id}.assets.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error('[projects] DELETE /:id/assets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete project ───────────────────────────────────────────────────────────
projectsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (await useDb()) {
      const { rowCount } = await query('DELETE FROM projects WHERE id = $1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'Project not found' });
      return res.json({ success: true });
    }
    // Filesystem fallback
    const filePath = path.join(projectsDir, `${id}.json`);
    const assetsPath = path.join(projectsDir, `${id}.assets.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });
    fs.unlinkSync(filePath);
    if (fs.existsSync(assetsPath)) fs.unlinkSync(assetsPath);
    res.json({ success: true });
  } catch (err) {
    console.error('[projects] DELETE /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
