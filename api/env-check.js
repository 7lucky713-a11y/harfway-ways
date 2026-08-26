export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    databaseEnv: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
      POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
      POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL)
    }
  });
}
