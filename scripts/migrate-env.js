#!/usr/bin/env node
/**
 * TUIFY — Migrate all data from one PaaS environment to another.
 *
 * Reads every project + asset from the STAGING API, re-uploads each asset
 * file to the PROD API (so files land in the production S3 bucket), rewrites
 * all CDN URLs in project data, then saves each project to production.
 *
 * No direct DB or server access required — runs purely over HTTP.
 *
 * Usage:
 *   STAGING_URL=https://feature-game-builder.tuify.app \
 *   PROD_URL=https://tuify.app \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD=yourpassword \
 *   node scripts/migrate-env.js
 *
 * Optional env vars:
 *   OLD_CDN  — staging CDN base to remap (default: auto-detected from uploads)
 *
 * Flags:
 *   --dry-run      Print what would happen without writing anything
 *   --skip-assets  Skip file re-upload (URLs in projects won't be remapped)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env.migrate first (migration-specific config), then fall back to .env
try { (await import('dotenv')).config({ path: path.join(ROOT, '.env.migrate') }); } catch {}
try { (await import('dotenv')).config({ path: path.join(ROOT, '.env') }); } catch {}

// ─── Config ────────────────────────────────────────────────────────────────────

const STAGING_URL = (process.env.STAGING_URL || '').replace(/\/$/, '');
const PROD_URL    = (process.env.PROD_URL    || '').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
// Old CDN base to replace. Default targets the feature-game-builder staging bucket.
const OLD_CDN     = (process.env.OLD_CDN || 'https://storage.tuify.app/feature-game-builder-builder-staging').replace(/\/$/, '');

const DRY_RUN     = process.argv.includes('--dry-run');
const SKIP_ASSETS = process.argv.includes('--skip-assets');

function fail(msg) { console.error('\n✗', msg); process.exit(1); }
function log(...a) { console.log(...a); }

if (!STAGING_URL) fail('Rellena STAGING_URL en .env.migrate  (URL del staging en el browser)');
if (!PROD_URL)    fail('Rellena PROD_URL en .env.migrate     (URL de producción en el browser)');
if (!ADMIN_EMAIL) fail('Rellena ADMIN_EMAIL en .env.migrate');
if (!ADMIN_PASS)  fail('Rellena ADMIN_PASSWORD en .env.migrate');

if (DRY_RUN) log('🔍 DRY RUN — nothing will be written to production\n');

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function login(baseUrl, email, password) {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Login to ${baseUrl} failed: ${r.status} — ${await r.text()}`);
  const { token } = await r.json();
  return token;
}

function makeApi(baseUrl, token) {
  return async function api(method, endpoint, body) {
    const opts = { method, headers: { Authorization: `Bearer ${token}` } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(`${baseUrl}${endpoint}`, opts);
    if (!r.ok) throw new Error(`${method} ${endpoint} → ${r.status}: ${await r.text()}`);
    return r.json();
  };
}

// ─── Asset helpers ─────────────────────────────────────────────────────────────

// Extract all unique CDN URLs matching the staging bucket from a JSON string.
function extractCdnUrls(jsonStr, cdnBase) {
  const escaped = cdnBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}/[^"'\\s]+`, 'g');
  return [...new Set(jsonStr.match(re) || [])];
}

function mimeFromFilename(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  })[ext] || 'application/octet-stream';
}

function assetTypeFromName(filename) {
  const prefix = filename.split('_')[0].toLowerCase();
  return ['sprite', 'tileset', 'sound', 'background', 'image'].includes(prefix) ? prefix : 'image';
}

// Download a file from stagingUrl, re-upload to production, return new CDN URL.
async function reuploadAsset(stagingUrl, prodBaseUrl, prodToken) {
  const dlRes = await fetch(stagingUrl);
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  const filename = decodeURIComponent(stagingUrl.split('/').pop().split('?')[0]);
  const mime     = mimeFromFilename(filename);
  const type     = assetTypeFromName(filename);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('type', type);

  const upRes = await fetch(`${prodBaseUrl}/api/assets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${prodToken}` },
    body: form,
  });
  if (!upRes.ok) throw new Error(`Upload failed: ${upRes.status} — ${await upRes.text()}`);
  const { url } = await upRes.json();
  return url; // new production CDN URL
}

// Replace all staging CDN URLs in a JSON string using the given map.
function remapUrls(jsonStr, urlMap) {
  let s = jsonStr;
  for (const [oldUrl, newUrl] of urlMap) {
    if (newUrl) s = s.replaceAll(oldUrl, newUrl);
  }
  return s;
}

// ─── Step 1: authenticate ──────────────────────────────────────────────────────

log('→ Authenticating…');
const stagingToken = await login(STAGING_URL, ADMIN_EMAIL, ADMIN_PASS);
log(`  ✓ staging (${STAGING_URL})`);

let prodToken = 'DRY_RUN';
if (!DRY_RUN) {
  prodToken = await login(PROD_URL, ADMIN_EMAIL, ADMIN_PASS);
  log(`  ✓ production (${PROD_URL})`);
}
log('');

const stagingApi = makeApi(STAGING_URL, stagingToken);
const prodApi    = DRY_RUN ? async () => ({ success: true }) : makeApi(PROD_URL, prodToken);

// ─── Step 2: load all projects from staging ────────────────────────────────────

log('→ Loading projects from staging…');
// ?all=true lets admin see every project across all users (requires admin role)
const projectList = await stagingApi('GET', '/api/projects?all=true');
log(`  Found ${projectList.length} project(s)\n`);

if (!projectList.length) {
  log('Nothing to migrate. Done.');
  process.exit(0);
}

// Load full data for each project
const projects = [];
const urlMap   = new Map(); // stagingUrl → prodUrl (null until re-uploaded)

for (const meta of projectList) {
  try {
    const data    = await stagingApi('GET', `/api/projects/${meta.id}`);
    const sidecar = await stagingApi('GET', `/api/projects/${meta.id}/assets`);
    const combined = JSON.stringify(data) + JSON.stringify(sidecar);
    for (const url of extractCdnUrls(combined, OLD_CDN)) {
      if (!urlMap.has(url)) urlMap.set(url, null);
    }
    projects.push({
      id:        meta.id,
      name:      meta.name,
      isDemo:    meta.isDemo,
      demoOrder: meta.demoOrder,
      dataStr:    JSON.stringify(data),
      sidecarStr: JSON.stringify(sidecar),
    });
    log(`  ✓ loaded: ${meta.name || meta.id}`);
  } catch (err) {
    log(`  ✗ ${meta.id}: ${err.message}`);
  }
}

log(`\n  ${projects.length} project(s) loaded`);
log(`  ${urlMap.size} unique asset file(s) found in project data\n`);

// ─── Step 3: re-upload assets to production ────────────────────────────────────

if (SKIP_ASSETS) {
  log('⚠ --skip-assets: skipping file upload — CDN URLs will NOT be rewritten\n');
  urlMap.clear();
} else if (urlMap.size > 0) {
  log(`→ Re-uploading ${urlMap.size} asset file(s) to production…`);
  let uploaded = 0, skipped = 0;

  for (const [stagingUrl] of [...urlMap]) {
    const filename = decodeURIComponent(stagingUrl.split('/').pop());
    if (DRY_RUN) {
      // In dry-run, simulate a prod URL so remap output is realistic
      urlMap.set(stagingUrl, stagingUrl.replace(OLD_CDN, 'https://storage.tuify.app/tui-builder-staging'));
      log(`  [dry] ${filename}`);
      uploaded++;
      continue;
    }
    try {
      const prodUrl = await reuploadAsset(stagingUrl, PROD_URL, prodToken);
      urlMap.set(stagingUrl, prodUrl);
      log(`  ✓ ${filename}`);
      log(`      → ${prodUrl}`);
      uploaded++;
    } catch (err) {
      log(`  ✗ ${filename}: ${err.message}`);
      urlMap.delete(stagingUrl); // skip remap for this file
      skipped++;
    }
  }
  log(`\n  ${uploaded} uploaded, ${skipped} failed\n`);
} else {
  log('ℹ No CDN asset URLs found in project data — skipping asset upload\n');
}

// ─── Step 4: save projects to production ──────────────────────────────────────

log(`→ Saving ${projects.length} project(s) to production…`);
let saved = 0, failed = 0;

for (const proj of projects) {
  const demoTag   = proj.isDemo ? ' [DEMO]' : '';
  const newData    = remapUrls(proj.dataStr,    urlMap);
  const newSidecar = remapUrls(proj.sidecarStr, urlMap);
  const urlsChanged = newData !== proj.dataStr || newSidecar !== proj.sidecarStr;

  log(`\n  ${proj.name || proj.id}${demoTag}${urlsChanged ? '  (URLs remapped)' : ''}`);

  if (DRY_RUN) {
    log(`    [dry] POST /api/projects + sidecar`);
    if (proj.isDemo) log(`    [dry] PATCH /api/projects/${proj.id}/demo  order=${proj.demoOrder}`);
    saved++;
    continue;
  }

  try {
    // Save project data
    await prodApi('POST', '/api/projects', JSON.parse(newData));

    // Save assets sidecar
    const sidecarRes = await fetch(`${PROD_URL}/api/projects/${proj.id}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${prodToken}`, 'Content-Type': 'application/json' },
      body: newSidecar,
    });
    if (!sidecarRes.ok) throw new Error(`sidecar save → ${sidecarRes.status}`);

    // Mark as demo if needed
    if (proj.isDemo) {
      await prodApi('PATCH', `/api/projects/${proj.id}/demo`, {
        isDemo: true,
        demoOrder: proj.demoOrder,
      });
      log(`    ✓ saved + marked as demo`);
    } else {
      log(`    ✓ saved`);
    }
    saved++;
  } catch (err) {
    log(`    ✗ ${err.message}`);
    failed++;
  }
}

// ─── Done ──────────────────────────────────────────────────────────────────────

log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log(`  Projects saved:    ${saved}${DRY_RUN ? ' (dry)' : ''}`);
log(`  Projects failed:   ${failed}`);
log(`  Assets uploaded:   ${[...urlMap.values()].filter(Boolean).length}`);
log(`  CDN base remapped: ${OLD_CDN}`);
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log(DRY_RUN ? '\nDry run complete — run without --dry-run to apply.' : '\n✅ Migration complete');
