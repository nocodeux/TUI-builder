import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Accepts PaaS env vars (STORAGE_*) with fallback to legacy AWS_* names.
const endpoint  = () => process.env.STORAGE_ENDPOINT   || process.env.AWS_ENDPOINT_URL;
const bucket    = () => process.env.STORAGE_BUCKET     || process.env.AWS_BUCKET || 'tuify-assets';

function client() {
  const ep = endpoint();
  const cfg = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId:     process.env.STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
  if (ep) {
    cfg.endpoint = ep;
    cfg.forcePathStyle = true; // required for MinIO / PaaS S3
  }
  return new S3Client(cfg);
}

export const s3Driver = {
  async upload(buffer, filename, mimeType) {
    const bkt = bucket();
    const key = `assets/${filename}`;
    await client().send(new PutObjectCommand({
      Bucket: bkt,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));
    const ep = endpoint();
    const cdnBase = (process.env.CDN_BASE_URL || (ep ? `${ep}/${bkt}` : `https://${bkt}.s3.amazonaws.com`)).replace(/\/$/, '');
    return { url: `${cdnBase}/${key}`, key };
  },

  async delete(key) {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};
