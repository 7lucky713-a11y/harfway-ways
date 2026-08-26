const names = ['DATABASE_URL','NEON_DATABASE_URL','POSTGRES_URL','POSTGRES_PRISMA_URL'];
console.log('[db-env-check]', Object.fromEntries(names.map(name => [name, Boolean(process.env[name])])));
