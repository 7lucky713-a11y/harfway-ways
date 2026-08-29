import fs from 'node:fs';

const file = 'public/ways-ads.js';
const before = "  const SERVE = TRACK_ENABLED ? `${ADS}/api/serve` : '/api/ads-fair-serve';";
const after = "  const SERVE = '/api/ads-fair-serve';";

const source = fs.readFileSync(file, 'utf8');
if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log('[ways-ads-fair] already patched');
    process.exit(0);
  }
  throw new Error('[ways-ads-fair] expected serve line not found');
}

fs.writeFileSync(file, source.replace(before, after));
console.log('[ways-ads-fair] WAYS serve path switched to local fair-v2; event path unchanged');
