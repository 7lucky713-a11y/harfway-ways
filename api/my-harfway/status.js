import {
  cors,
  ensureReaderSchema,
  getSql,
  readerSchemaStatus,
  sendError
} from '../../lib/my-harfway-db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const sql = getSql();
    await ensureReaderSchema(sql);
    return res.status(200).json({ ok: true, schema: await readerSchemaStatus(sql) });
  } catch (error) {
    return sendError(res, error);
  }
}
