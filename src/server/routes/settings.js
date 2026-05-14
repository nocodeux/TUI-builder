import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isAvailable } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.resolve(__dirname, '../../../settings.json');
const SETTINGS_KEY = 'global';

export const settingsRouter = express.Router();

const defaultSettings = { builderName: 'TUIFY Builder', theme: 'theme-nano' };

// GET /api/settings
settingsRouter.get('/', async (_req, res) => {
  try {
    if (await isAvailable()) {
      const { rows } = await query('SELECT value FROM settings_kv WHERE key = $1', [SETTINGS_KEY]);
      return res.json(rows.length ? rows[0].value : defaultSettings);
    }
    // Filesystem fallback
    if (fs.existsSync(settingsPath)) {
      return res.json(JSON.parse(fs.readFileSync(settingsPath, 'utf-8')));
    }
    res.json(defaultSettings);
  } catch (err) {
    console.error('[settings] GET error:', err.message);
    res.json(defaultSettings);
  }
});

// POST /api/settings
settingsRouter.post('/', async (req, res) => {
  try {
    if (await isAvailable()) {
      await query(
        `INSERT INTO settings_kv (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [SETTINGS_KEY, JSON.stringify(req.body)]
      );
      return res.json({ success: true });
    }
    // Filesystem fallback
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('[settings] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
