import { neon } from '@neondatabase/serverless';

if (process.env.VERCEL_ENV !== 'preview') {
  console.log('[ads-paused-migration] skip outside Preview');
  process.exit(0);
}

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('[ads-paused-migration] ADS_DATABASE_URL missing');

const expectedHost = 'ep-damp-resonance-awphji1s-pooler.c-12.us-east-1.aws.neon.tech';
let host = '';
try { host = new URL(url).hostname; } catch {}
if (host !== expectedHost) throw new Error(`[ads-paused-migration] unexpected DB host: ${host || 'invalid'}`);

const sql = neon(url);
const rows = await sql`
  SELECT pg_get_constraintdef(oid, true) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.ad_campaigns'::regclass
    AND conname = 'ad_campaigns_status_check'
  LIMIT 1
`;

if (!rows.length) throw new Error('[ads-paused-migration] status constraint missing');
const definition = String(rows[0].definition || '');

if (definition.includes("'paused'::text")) {
  console.log('[ads-paused-migration] already applied');
  process.exit(0);
}

const found = [...definition.matchAll(/'([^']+)'::text/g)].map(m => m[1]).sort();
const expected = ['active','completed','draft','pending','rejected'].sort();
if (JSON.stringify(found) !== JSON.stringify(expected)) {
  throw new Error(`[ads-paused-migration] unexpected current statuses: ${JSON.stringify(found)}`);
}

await sql`
  ALTER TABLE public.ad_campaigns
    DROP CONSTRAINT ad_campaigns_status_check,
    ADD CONSTRAINT ad_campaigns_status_check
      CHECK (status = ANY (ARRAY[
        'draft'::text,
        'pending'::text,
        'active'::text,
        'paused'::text,
        'completed'::text,
        'rejected'::text
      ]))
`;

const verify = await sql`
  SELECT pg_get_constraintdef(oid, true) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.ad_campaigns'::regclass
    AND conname = 'ad_campaigns_status_check'
  LIMIT 1
`;
const verified = String(verify[0]?.definition || '');
if (!verified.includes("'paused'::text")) throw new Error('[ads-paused-migration] verification failed');
console.log('[ads-paused-migration] APPLIED + VERIFIED paused status on live ADS DB');
