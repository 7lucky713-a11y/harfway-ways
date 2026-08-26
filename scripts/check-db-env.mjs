import { neon } from '@neondatabase/serverless';

const names = ['DATABASE_URL','NEON_DATABASE_URL','POSTGRES_URL','POSTGRES_PRISMA_URL'];
const available = Object.fromEntries(names.map(name => [name, Boolean(process.env[name])]));
console.log('[db-env-check]', available);

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.log('[db-connect-check] skipped: no database URL configured');
  process.exit(0);
}

try {
  const sql = neon(url);
  const rows = await sql`SELECT count(*)::int AS event_count FROM public.ways_analytics_events`;
  console.log('[db-connect-check]', { ok: true, analytics_table: true, event_count: rows?.[0]?.event_count ?? null });
} catch (error) {
  console.error('[db-connect-check]', { ok: false, message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
