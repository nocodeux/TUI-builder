import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function client() {
  const cfg = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
  if (process.env.AWS_ENDPOINT_URL) {
    cfg.endpoint = process.env.AWS_ENDPOINT_URL;
    cfg.forcePathStyle = true; // required for MinIO / R2
  }
  return new S3Client(cfg);
}

export const s3Driver = {
  async upload(buffer, filename, mimeType) {
    const bucket = process.env.AWS_BUCKET || 'tuify-assets';
    const key = `assets/${filename}`;
    await client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));
    const cdnBase = (process.env.CDN_BASE_URL || `https://${bucket}.s3.amazonaws.com`).replace(/\/$/, '');
    return { url: `${cdnBase}/${key}`, key };
  },

  async delete(key) {
    const bucket = process.env.AWS_BUCKET || 'tuify-assets';
    await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};
