import fs from 'fs';
import path from 'path';

function uploadsDir() {
  return path.resolve(process.cwd(), process.env.STORAGE_PATH || './uploads');
}

export const localDriver = {
  async upload(buffer, filename, _mimeType) {
    const dir = uploadsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    const base = (process.env.CDN_BASE_URL || 'http://localhost:3002/uploads').replace(/\/$/, '');
    return { url: `${base}/${filename}`, key: `uploads/${filename}` };
  },

  async delete(key) {
    const filename = key.replace(/^uploads\//, '');
    const fp = path.join(uploadsDir(), filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  },
};
