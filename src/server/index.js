import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectsRouter } from './routes/projects.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { assetsRouter } from './routes/assets.js';
import { publishRouter } from './routes/publish.js';
import { requireAuth } from './middleware/auth.js';
import { runSchema, isAvailable, query } from './db/index.js';

// Load .env if present (dev convenience — production uses real env vars)
try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optional */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const isProd = process.env.NODE_ENV === 'production';

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3001', 'http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Increase limit — assets sidecar can contain large base64 payloads.
// Phase 3 removes this need (assets move to S3), but required until then.
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve uploaded assets (local driver)
const uploadsPath = path.resolve(process.cwd(), process.env.STORAGE_PATH || './uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve standalone game runtime (built by npm run build:runtime)
const runtimePath = isProd
  ? path.resolve(__dirname, '../../dist/runtime')
  : path.resolve(__dirname, '../../public/runtime');
app.use('/runtime', express.static(runtimePath));

// Auth routes (public — no requireAuth)
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/assets', requireAuth, assetsRouter);
app.use('/api/publish', requireAuth, publishRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now(), version: '1.0.0' });
});

// ─── Public published page route: /:username/:slug ────────────────────────────
// Must be registered before the React catch-all so it works in production.
// In dev, the React app runs on a separate Vite port, so this is the only handler.
app.get('/:username/:slug', async (req, res, next) => {
  const { username, slug } = req.params;
  // Skip API, static assets, and special paths
  if (username.startsWith('_') || username === 'api' || username === 'runtime' || username === 'uploads') return next();
  if (!await isAvailable()) return next();
  try {
    const { rows } = await query(
      `SELECT pp.html_content, pp.is_public
       FROM published_pages pp
       JOIN users u ON u.id = pp.owner_id
       WHERE u.username = $1 AND pp.slug = $2`,
      [username, slug]
    );
    if (!rows.length) return next();
    const page = rows[0];
    if (!page.is_public) return res.status(403).send('This page is private');
    if (!page.html_content) return next();
    // Increment visit counter (fire-and-forget)
    query('UPDATE published_pages SET visit_count = visit_count + 1 WHERE owner_id = (SELECT id FROM users WHERE username = $1) AND slug = $2', [username, slug]).catch(() => {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page.html_content);
  } catch (err) {
    console.error('[serve]', err.message);
    next();
  }
});

// Serve built React app in production
if (isProd) {
  const distPath = path.resolve(__dirname, '../../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, async () => {
  console.log(`TUIFY server :${PORT} [${isProd ? 'production' : 'development'}]`);
  if (!isProd) console.log(`  → API available at http://localhost:${PORT}/api`);

  // DB init — applies schema.sql if DATABASE_URL is configured
  if (process.env.DATABASE_URL) {
    try {
      await runSchema();
      console.log('[db] PostgreSQL connected ✓');
    } catch (err) {
      console.warn('[db] PostgreSQL unavailable — using filesystem fallback:', err.message);
    }
  } else {
    console.log('[db] No DATABASE_URL — using filesystem storage');
  }
});
