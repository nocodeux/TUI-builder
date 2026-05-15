import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Tuify PaaS injects: S3_ENDPOINT, S3_BUCKET, S3_PUBLIC_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
// Fallback to legacy AWS_ENDPOINT_URL / AWS_BUCKET for local dev or other providers.
const endpoint  = () => process.env.S3_ENDPOINT        || process.env.AWS_ENDPOINT_URL;
const bucket    = () => process.env.S3_BUCKET          || process.env.AWS_BUCKET || 'tuify-assets';

function client() {
  const ep = endpoint();
  const cfg = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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
    // S3_PUBLIC_URL is the public-facing base URL provided by the PaaS
    const ep = endpoint();
    const cdnBase = (process.env.S3_PUBLIC_URL || process.env.CDN_BASE_URL || (ep ? `${ep}/${bkt}` : `https://${bkt}.s3.amazonaws.com`)).replace(/\/$/, '');
    return { url: `${cdnBase}/${key}`, key };
  },

  async delete(key) {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};
