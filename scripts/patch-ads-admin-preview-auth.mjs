import fs from 'node:fs';

if (process.env.VERCEL_ENV !== 'preview') {
  console.log('[ads-admin-preview-auth] skipped outside Preview');
  process.exit(0);
}

const file = 'src/pages/ads-admin.astro';
const before = "auth:{url:'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth'},";
const after = "auth:{url:window.location.origin+'/api/neon-auth-proxy'},";
const src = fs.readFileSync(file, 'utf8');
if (!src.includes(before)) {
  if (src.includes(after)) {
    console.log('[ads-admin-preview-auth] already patched');
    process.exit(0);
  }
  throw new Error('ADS ADMIN auth source signature not found; refusing to patch');
}
fs.writeFileSync(file, src.replace(before, after));
console.log('[ads-admin-preview-auth] injected absolute same-origin Auth proxy before Astro build');
