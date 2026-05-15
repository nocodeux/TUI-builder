#!/usr/bin/env node
/**
 * One-time fix: assign projects with owner_id = NULL to the admin user.
 *
 * Usage:
 *   PAAS_URL=https://your-app.tuify.app \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD=yourpassword \
 *   node scripts/fix-orphan-projects.js
 */

try { (await import('dotenv')).config(); } catch {}

const PAAS_URL   = (process.env.PAAS_URL   || '').replace(/\/$/, '');
const EMAIL      = process.env.ADMIN_EMAIL;
const PASSWORD   = process.env.ADMIN_PASSWORD;

if (!PAAS_URL || !EMAIL || !PASSWORD) {
  console.error('Set PAAS_URL, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

console.log(`→ Logging in as ${EMAIL} …`);
const loginRes = await fetch(`${PAAS_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`✗ Login failed: ${loginRes.status} — ${await loginRes.text()}`);
  process.exit(1);
}
const { token } = await loginRes.json();
console.log('✓ Logged in\n');

console.log('→ Claiming orphan projects …');
const res = await fetch(`${PAAS_URL}/api/projects/admin/claim-orphans`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.json();
if (!res.ok) {
  console.error(`✗ Failed: ${res.status} — ${body.error}`);
  process.exit(1);
}
console.log(`✓ Done — ${body.claimed} project(s) claimed`);
