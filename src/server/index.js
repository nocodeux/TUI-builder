import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectsRouter } from './routes/projects.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { runSchema, isAvailable } from './db/index.js';

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

// Auth routes (public — no requireAuth)
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/settings', requireAuth, settingsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now(), version: '1.0.0' });
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
