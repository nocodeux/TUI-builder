/**
 * Migrates existing base64 assets in the DB to S3/local storage.
 * Safe to re-run — skips assets already on CDN (src starts with http/https).
 *
 * Prerequisites:
 *   1. pg_dump $DATABASE_URL > backup_pre_s3_$(date +%Y%m%d).sql
 *   2. Verify backup is valid
 *   3. Set STORAGE_DRIVER, AWS_* vars (or STORAGE_DRIVER=local + STORAGE_PATH)
 *
 * Usage:
 *   DATABASE_URL=... STORAGE_DRIVER=local npm run db:migrate:assets
 *   DATABASE_URL=... STORAGE_DRIVER=s3 AWS_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... npm run db:migrate:assets
 */

try { const { config } = await import('dotenv'); config(); } catch {}

import pg from 'pg';
import { getStorageDriver } from '../storage/index.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function base64ToBuffer(dataUrl) {
  const [, base64] = dataUrl.split(',');
  return Buffer.from(base64, 'base64');
}

function mimeFromDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'application/octet-stream';
}

function extFromMime(mime) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };
  return map[mime] || 'bin';
}

async function migrateAssetField(assetObj, type, driver) {
  const { src } = assetObj;
  if (!src || !src.startsWith('data:')) return assetObj; // already URL or empty
  const mime = mimeFromDataUrl(src);
  const ext = extFromMime(mime);
  const id = crypto.randomUUID();
  const filename = `${type}_${id}.${ext}`;
  const buffer = await base64ToBuffer(src);
  const { url } = await driver.upload(buffer, filename, mime);
  return { ...assetObj, src: url };
}

async function migrate() {
  const driver = getStorageDriver();
  const { rows: projects } = await pool.query('SELECT id, assets_json FROM projects');
  console.log(`[migrate:assets] Found ${projects.length} project(s).`);

  let migrated = 0, skipped = 0, errors = 0;

  for (const project of projects) {
    const aj = project.assets_json || {};
    let changed = false;

    try {
      const newAj = { ...aj };

      for (const [key, typeLabel] of [
        ['sprites', 'sprite'], ['tilesets', 'tileset'],
        ['backgrounds', 'background'], ['sounds', 'sound'],
      ]) {
        if (!Array.isArray(aj[key])) continue;
        const updated = await Promise.all(
          aj[key].map(item => migrateAssetField(item, typeLabel, driver))
        );
        if (JSON.stringify(updated) !== JSON.stringify(aj[key])) {
          newAj[key] = updated;
          changed = true;
        }
      }

      if (changed) {
        await pool.query(
          'UPDATE projects SET assets_json = $1 WHERE id = $2',
          [JSON.stringify(newAj), project.id]
        );
        console.log(`  ✓ Migrated assets for project ${project.id}`);
        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ Error migrating project ${project.id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n[migrate:assets] Done.  Migrated: ${migrated}  Skipped: ${skipped}  Errors: ${errors}`);
  await pool.end();
}

migrate().catch(err => { console.error('[migrate:assets] Fatal:', err); process.exit(1); });
