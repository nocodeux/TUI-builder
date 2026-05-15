import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isAvailable } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.resolve(__dirname, '../../../settings.json');
const GLOBAL_KEY = 'global';

export const settingsRouter = express.Router();

const defaultGlobal = { builderName: 'TUIFY Builder' };

// GET /api/settings — merges global + per-user settings
settingsRouter.get('/', async (req, res) => {
  try {
    if (await isAvailable()) {
      const userId = req.user?.userId;
      const [globalRes, userRes] = await Promise.all([
        query('SELECT value FROM settings_kv WHERE key = $1', [GLOBAL_KEY]),
        userId
          ? query('SELECT value FROM settings_kv WHERE key = $1', [`user:${userId}`])
          : Promise.resolve({ rows: [] }),
      ]);
      const global = globalRes.rows[0]?.value || defaultGlobal;
      const user = userRes.rows[0]?.value || {};
      return res.json({ ...global, ...user });
    }
    // Filesystem fallback (single-user)
    if (fs.existsSync(settingsPath)) {
      return res.json(JSON.parse(fs.readFileSync(settingsPath, 'utf-8')));
    }
    res.json(defaultGlobal);
  } catch (err) {
    console.error('[settings] GET error:', err.message);
    res.json(defaultGlobal);
  }
});

// POST /api/settings
// - builderName → global, admin-only
// - everything else → per-user (or global on filesystem fallback)
settingsRouter.post('/', async (req, res) => {
  const { builderName, ...userFields } = req.body || {};
  const isAdmin = req.user?.role === 'admin';

  try {
    if (await isAvailable()) {
      const userId = req.user?.userId;

      if (builderName !== undefined && isAdmin) {
        const cur = await query('SELECT value FROM settings_kv WHERE key = $1', [GLOBAL_KEY]);
        const existing = cur.rows[0]?.value || {};
        await query(
          `INSERT INTO settings_kv (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [GLOBAL_KEY, JSON.stringify({ ...existing, builderName })]
        );
      }

      if (userId && Object.keys(userFields).length > 0) {
        const cur = await query('SELECT value FROM settings_kv WHERE key = $1', [`user:${userId}`]);
        const existing = cur.rows[0]?.value || {};
        await query(
          `INSERT INTO settings_kv (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [`user:${userId}`, JSON.stringify({ ...existing, ...userFields })]
        );
      }

      return res.json({ success: true });
    }

    // Filesystem fallback (single-user — save everything, gate builderName on admin)
    const existing = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : {};
    const updated = isAdmin
      ? { ...existing, ...req.body }
      : { ...existing, ...userFields };
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('[settings] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
