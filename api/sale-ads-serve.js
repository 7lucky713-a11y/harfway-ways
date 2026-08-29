import fairServe from './ads-fair-serve.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), placement: 'sale' };
  return fairServe(req, res);
}
