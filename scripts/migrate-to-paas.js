#!/usr/bin/env node
/**
 * TUIFY — Migrate local PostgreSQL + assets to PaaS
 *
 * Reads from the local DATABASE_URL and uploads to the PaaS server.
 *
 * Usage:
 *   # From local PostgreSQL (default):
 *   PAAS_URL=https://your-app.tuify.app \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD=yourpassword \
 *   node scripts/migrate-to-paas.js
 *
 *   # From local filesystem only (no local DB):
 *   node scripts/migrate-to-paas.js --no-db
 *
 * Optional flags:
 *   --dry-run        Print what would happen without sending anything
 *   --assets-only    Only migrate asset files
 *   --projects-only  Only migrate projects (skips asset file upload)
 *   --no-db          Read projects from projects/*.json instead of local PostgreSQL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Config ───────────────────────────────────────────────────────────────────

// Load .env
try { (await import('dotenv')).config({ path: path.join(ROOT, '.env') }); } catch {}

const PAAS_URL    = (process.env.PAAS_URL    || '').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
const LOCAL_DB    = process.env.DATABASE_URL; // local PostgreSQL

const DRY_RUN       = process.argv.includes('--dry-run');
const ASSETS_ONLY   = process.argv.includes('--assets-only');
const PROJECTS_ONLY = process.argv.includes('--projects-only');
const NO_DB         = process.argv.includes('--no-db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(msg) { console.error('\n✗', msg); process.exit(1); }
function log(...a) { console.log(...a); }

async function apiPost(token, endpoint, body) {
  const r = await fetch(`${PAAS_URL}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function apiPatch(token, endpoint, body) {
  const r = await fetch(`${PAAS_URL}${endpoint}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function uploadFile(token, filePath, type) {
  const filename = path.basename(filePath);
  const buffer   = fs.readFileSync(filePath);
  const ext      = filename.split('.').pop().toLowerCase();
  const mime     = ({ png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
                      gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
                      mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav' })[ext]
                  || 'application/octet-stream';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('type', type);

  const r = await fetch(`${PAAS_URL}/api/assets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!r.ok) throw new Error(`Upload ${filename} → ${r.status}: ${await r.text()}`);
  return r.json(); // { url, assetId, key }
}

function assetType(filename) {
  const prefix = filename.split('_')[0].toLowerCase();
  return ['sprite','tileset','sound','background','image'].includes(prefix) ? prefix : 'image';
}

const URL_MAP_FILE = path.join(__dirname, '.migrate-urlmap.json');

function saveUrlMap(map) {
  fs.writeFileSync(URL_MAP_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
}

function loadUrlMap() {
  if (!fs.existsSync(URL_MAP_FILE)) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf-8'))));
  } catch { return new Map(); }
}

function remapUrls(json, urlMap) {
  if (!urlMap.size) return json;
  let s = JSON.stringify(json);
  for (const [localPath, newUrl] of urlMap) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace full http://localhost:PORT/path references (most common — localDriver returns full URLs)
    s = s.replace(new RegExp(`http://localhost:\\d+${escaped}`, 'g'), newUrl);
    // Replace bare /path references (relative URLs)
    s = s.replaceAll(localPath, newUrl);
  }
  return JSON.parse(s);
}

// ─── Validate ─────────────────────────────────────────────────────────────────

if (!PAAS_URL)    fail('Set PAAS_URL env var (e.g. https://your-app.tuify.app)');
if (!ADMIN_EMAIL) fail('Set ADMIN_EMAIL env var');
if (!ADMIN_PASS)  fail('Set ADMIN_PASSWORD env var');
if (!NO_DB && !LOCAL_DB) {
  log('⚠ No local DATABASE_URL found — falling back to filesystem (projects/*.json)');
  log('  Use --no-db to suppress this warning.\n');
}

if (DRY_RUN) log('🔍 DRY RUN — nothing will be sent\n');

// ─── Login ────────────────────────────────────────────────────────────────────

log(`→ Logging in as ${ADMIN_EMAIL} on ${PAAS_URL} …`);
let token = 'DRY_RUN_TOKEN';
if (!DRY_RUN) {
  const r = await fetch(`${PAAS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!r.ok) fail(`Login failed: ${r.status} — ${await r.text()}`);
  token = (await r.json()).token;
}
log('✓ Logged in\n');

// ─── Step 1: upload assets ────────────────────────────────────────────────────

// Load previously saved URL map so --projects-only still remaps correctly
const urlMap = loadUrlMap();
if (PROJECTS_ONLY && urlMap.size) log(`ℹ Loaded ${urlMap.size} URL mapping(s) from previous asset upload\n`);

if (!PROJECTS_ONLY) {
  const uploadsDir = path.join(ROOT, process.env.STORAGE_PATH || 'uploads');
  const files = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).filter(f => !f.startsWith('.'))
    : [];

  if (!files.length) {
    log('ℹ No files in uploads/ — skipping asset upload\n');
  } else {
    log(`→ Uploading ${files.length} asset files …`);
    let ok = 0, failed = 0;
    for (const filename of files) {
      const type      = assetType(filename);
      const localPath = `/uploads/${filename}`;
      if (DRY_RUN) {
        urlMap.set(localPath, `https://s3.example.com/BUCKET/${filename}`);
        log(`  [dry] ${filename} (${type})`);
        ok++;
        continue;
      }
      try {
        const { url } = await uploadFile(token, path.join(uploadsDir, filename), type);
        urlMap.set(localPath, url);
        log(`  ✓ ${filename}`);
        log(`    → ${url}`);
        ok++;
      } catch (err) {
        log(`  ✗ ${filename}: ${err.message}`);
        failed++;
      }
    }
    log(`\n  ${ok} uploaded, ${failed} failed`);
    if (!DRY_RUN && ok > 0) {
      saveUrlMap(urlMap);
      log(`  URL map saved to scripts/.migrate-urlmap.json\n`);
    } else {
      log('');
    }
  }
}

// ─── Step 2: load projects ────────────────────────────────────────────────────

let projects = []; // [{ id, name, data, assetsJson, isDemo, demoOrder, lastSaved }]

const useDb = !NO_DB && !!LOCAL_DB;

if (useDb) {
  log('→ Reading projects from local PostgreSQL …');
  const pool = new Pool({ connectionString: LOCAL_DB, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query(
      `SELECT id, name, data, assets_json, is_demo, demo_order, last_saved
       FROM projects ORDER BY last_saved DESC`
    );
    projects = rows.map(r => ({
      id:         r.id,
      name:       r.name,
      data:       r.data,
      assetsJson: r.assets_json,
      isDemo:     r.is_demo,
      demoOrder:  r.demo_order,
      lastSaved:  r.last_saved,
    }));
    log(`✓ Found ${projects.length} project(s) in local DB\n`);
  } catch (err) {
    fail(`Cannot connect to local PostgreSQL: ${err.message}\n  Check DATABASE_URL in .env or use --no-db`);
  } finally {
    await pool.end();
  }
} else {
  log('→ Reading projects from projects/*.json …');
  const dir = path.join(ROOT, 'projects');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.assets.json'))
    : [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      const assetsFile = path.join(dir, f.replace('.json', '.assets.json'));
      const assetsJson = fs.existsSync(assetsFile)
        ? JSON.parse(fs.readFileSync(assetsFile, 'utf-8'))
        : null;
      projects.push({ id: data.id || f.replace('.json',''), name: data.name, data, assetsJson, isDemo: false, demoOrder: 0 });
    } catch {}
  }
  log(`✓ Found ${projects.length} project(s) in filesystem\n`);
}

// ─── Step 3: migrate projects ─────────────────────────────────────────────────

if (!ASSETS_ONLY) {
  if (!projects.length) {
    log('ℹ No projects found — skipping\n');
  } else {
    log(`→ Migrating ${projects.length} project(s) to PaaS …\n`);
    let ok = 0, failed = 0;

    for (const proj of projects) {
      const demoTag = proj.isDemo ? ' [DEMO]' : '';
      log(`  ${proj.name || proj.id}${demoTag}`);

      // Remap asset URLs in project data
      const remappedData = remapUrls(proj.data, urlMap);

      // Build the payload the /api/projects endpoint expects
      const payload = {
        ...remappedData,
        id:        proj.id,
        name:      proj.name,
        lastSaved: proj.lastSaved,
      };

      if (DRY_RUN) {
        log(`    [dry] POST /api/projects  id=${proj.id}${proj.isDemo ? `  PATCH demo order=${proj.demoOrder}` : ''}`);
        ok++;
        continue;
      }

      try {
        await apiPost(token, '/api/projects', payload);

        // Save assets sidecar if present
        if (proj.assetsJson) {
          const remappedAssets = remapUrls(proj.assetsJson, urlMap);
          await apiPost(token, `/api/projects/${proj.id}/assets`, remappedAssets);
        }

        // Mark as demo if needed
        if (proj.isDemo) {
          await apiPatch(token, `/api/projects/${proj.id}/demo`, {
            isDemo: true,
            demoOrder: proj.demoOrder,
          });
          log(`    ✓ saved + flagged as demo (order ${proj.demoOrder})`);
        } else {
          log(`    ✓ saved`);
        }
        ok++;
      } catch (err) {
        log(`    ✗ ${err.message}`);
        failed++;
      }
    }

    log(`\n  ${ok} migrated, ${failed} failed`);
  }
}

log('\n✅ Migration complete');
