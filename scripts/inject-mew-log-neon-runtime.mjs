import fs from 'node:fs';
import path from 'node:path';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

const targets = [
  path.resolve('dist/mew-log/index.html'),
  path.resolve('dist/mew-log/admin/index.html')
];
const runtimeTag = '<script src="/mew-log/neon-runtime.js"></script>';
const mediaCss = '<link rel="stylesheet" href="/mew-log/media.css">';

const r2Flags = {
  accountId: Boolean(process.env.R2_ACCOUNT_ID),
  accessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
  secretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
  bucket: Boolean(process.env.R2_BUCKET),
  publicBase: Boolean(process.env.R2_PUBLIC_BASE_URL)
};
console.log('[mew-log-r2-env]', JSON.stringify(r2Flags));

if (Object.values(r2Flags).every(Boolean)) {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });

  try {
    await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: 'mew-log/',
      MaxKeys: 1
    }));
    console.log('[mew-log-r2-read] ok');
  } catch (error) {
    console.log('[mew-log-r2-read] failed', String(error?.name || error?.Code || error?.message || 'unknown').slice(0, 120));
  }

  if (process.env.VERCEL_ENV !== 'production') {
    const probeKey = `mew-log/guard/probe/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: probeKey,
        Body: 'mew-log-preview-r2-write-probe',
        ContentType: 'text/plain',
        CacheControl: 'no-store'
      }));
      console.log('[mew-log-r2-write] ok');
      try {
        await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: probeKey }));
        console.log('[mew-log-r2-delete] ok');
      } catch (error) {
        console.log('[mew-log-r2-delete] failed', String(error?.name || error?.Code || error?.message || 'unknown').slice(0, 120));
      }
    } catch (error) {
      console.log('[mew-log-r2-write] failed', String(error?.name || error?.Code || error?.message || 'unknown').slice(0, 120));
    }
  }
}

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(mediaCss)) html = html.replace('</head>', `${mediaCss}</head>`);
  if (!html.includes(runtimeTag)) html = html.replace('</body>', `${runtimeTag}</body>`);
  fs.writeFileSync(file, html, 'utf8');
}
console.log('[mew-log-neon-runtime] injected with media styles');
