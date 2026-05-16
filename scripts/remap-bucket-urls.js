#!/usr/bin/env node
/**
 * TUIFY — Remap asset URLs across bucket name changes
 *
 * When a deployment uses a different S3 bucket than the one where assets
 * were originally uploaded, project data has stale hardcoded URLs pointing
 * to the old bucket. This script:
 *
 *   1. Scans all projects + asset sidecars in the PaaS DB
 *   2. Reports every unique base URL found (so you can see what bucket is referenced)
 *   3. Replaces OLD_BASE_URL with NEW_BASE_URL in every project and sidecar
 *
 * Usage:
 *   PAAS_URL=https://your-app.tuify.app \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD=yourpassword \
 *   OLD_BASE_URL=https://storage.tuify.app/tui-builder-assets-staging \
 *   NEW_BASE_URL=https://storage.tuify.app/tui-builder-assets-prod \
 *   node scripts/remap-bucket-urls.js
 *
 * Add --dry-run to only print what would change without writing anything.
 * Omit OLD_BASE_URL / NEW_BASE_URL to run in scan-only (diagnostic) mode.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

try { (await import('dotenv')).config({ path: path.join(ROOT, '.env') }); } catch {}

const PAAS_URL    = (process.env.PAAS_URL    || '').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
const OLD_BASE    = (process.env.OLD_BASE_URL || '').replace(/\/$/, '');
const NEW_BASE    = (process.env.NEW_BASE_URL || '').replace(/\/$/, '');
const DRY_RUN     = process.argv.includes('--dry-run');
const SCAN_ONLY   = !OLD_BASE || !NEW_BASE;

function fail(msg) { console.error('\n✗', msg); process.exit(1); }
function log(...a) { console.log(...a); }

if (!PAAS_URL)    fail('Set PAAS_URL');
if (!ADMIN_EMAIL) fail('Set ADMIN_EMAIL');
if (!ADMIN_PASS)  fail('Set ADMIN_PASSWORD');

// ─── Auth ─────────────────────────────────────────────────────────────────────

log('\n→ Logging in to', PAAS_URL);
const loginRes = await fetch(`${PAAS_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
});
if (!loginRes.ok) fail(`Login failed: ${await loginRes.text()}`);
const { token } = await loginRes.json();
log('✓ Authenticated');

async function api(method, endpoint, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${PAAS_URL}${endpoint}`, opts);
  if (!r.ok) throw new Error(`${method} ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Load all projects ────────────────────────────────────────────────────────

log('\n→ Loading project list…');
const projects = await api('GET', '/api/projects');
log(`  Found ${projects.length} project(s)`);

// ─── Scan + remap ─────────────────────────────────────────────────────────────

const urlPattern = /https?:\/\/[^\s"']+\/assets\/[^\s"']+/g;
const baseCounts = {};   // base → count of references
let projectsChanged = 0;

for (const proj of projects) {
  const id = proj.id;

  // Load full project data + sidecar
  let data, sidecar;
  try {
    data   = await api('GET', `/api/projects/${id}`);
    sidecar = await (await fetch(`${PAAS_URL}/api/projects/${id}/assets`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json().catch(() => null);
  } catch (err) {
    log(`  ⚠ Could not load project ${id}: ${err.message}`);
    continue;
  }

  // Collect all URL bases found in this project
  const dataStr    = JSON.stringify(data);
  const sidecarStr = sidecar ? JSON.stringify(sidecar) : '';
  const allUrls    = [...(dataStr.match(urlPattern) || []), ...(sidecarStr.match(urlPattern) || [])];

  for (const url of allUrls) {
    // Extract base = everything up to /assets/
    const base = url.replace(/\/assets\/.*$/, '');
    baseCounts[base] = (baseCounts[base] || 0) + 1;
  }

  if (SCAN_ONLY) continue;

  // Remap
  const newDataStr    = dataStr.replaceAll(OLD_BASE, NEW_BASE);
  const newSidecarStr = sidecarStr ? sidecarStr.replaceAll(OLD_BASE, NEW_BASE) : null;

  const dataChanged    = newDataStr    !== dataStr;
  const sidecarChanged = newSidecarStr !== sidecarStr;

  if (!dataChanged && !sidecarChanged) continue;

  log(`  ${DRY_RUN ? '[dry]' : '→'} Project "${proj.name}" (${id}) — URLs updated`);

  if (!DRY_RUN) {
    if (dataChanged) {
      await api('POST', '/api/projects', JSON.parse(newDataStr));
    }
    if (sidecarChanged) {
      await fetch(`${PAAS_URL}/api/projects/${id}/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: newSidecarStr,
      });
    }
  }
  projectsChanged++;
}

// ─── Report ───────────────────────────────────────────────────────────────────

log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('ASSET URL BASES FOUND IN YOUR PROJECTS:');
if (Object.keys(baseCounts).length === 0) {
  log('  (none — no asset URLs found in any project)');
} else {
  for (const [base, count] of Object.entries(baseCounts).sort((a, b) => b[1] - a[1])) {
    log(`  ${count.toString().padStart(4)} refs  →  ${base}`);
  }
}

if (SCAN_ONLY) {
  log('\n⚠ Scan-only mode. To remap URLs, set OLD_BASE_URL and NEW_BASE_URL.');
  log('  Example:');
  log('    OLD_BASE_URL=https://storage.tuify.app/tui-builder-assets-staging \\');
  log('    NEW_BASE_URL=https://storage.tuify.app/tui-builder-assets-prod \\');
  log('    node scripts/remap-bucket-urls.js');
} else {
  log(`\n${DRY_RUN ? '[dry-run] Would update' : '✓ Updated'} ${projectsChanged} project(s)`);
  log(`  ${OLD_BASE}  →  ${NEW_BASE}`);
}
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
