import express from 'express';
import multer from 'multer';
import { getStorageDriver } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export const assetsRouter = express.Router();

assetsRouter.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  try {
    const type = (req.body.type || 'image').replace(/[^a-z0-9_-]/gi, '');
    const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
    const id = crypto.randomUUID();
    const filename = `${type}_${id}.${ext}`;

    const { url, key } = await getStorageDriver().upload(file.buffer, filename, file.mimetype);
    res.json({ url, assetId: id, key });
  } catch (err) {
    console.error('[assets] upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

assetsRouter.delete('/:key(*)', requireAuth, async (req, res) => {
  try {
    await getStorageDriver().delete(req.params.key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
