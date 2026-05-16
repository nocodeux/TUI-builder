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
    const cdn = process.env.CDN_BASE_URL;
    const url = cdn ? `${cdn.replace(/\/$/, '')}/${filename}` : `/uploads/${filename}`;
    return { url, key: `uploads/${filename}` };
  },

  async delete(key) {
    const filename = key.replace(/^uploads\//, '');
    const fp = path.join(uploadsDir(), filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  },
};
