const SOURCE = 'https://harf-way-game-scrapbook.vercel.app/';
const FAIR = 'https://harfway-playback.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).send('not found');

  try {
    const upstream = await fetch(SOURCE, { cache: 'no-store' });
    if (!upstream.ok) return res.status(502).send(`upstream ${upstream.status}`);
    let html = await upstream.text();

    html = html
      .replace("const ADS='https://harfway-ads-delivery.vercel.app';", `const ADS='${FAIR}';const ADS_PREVIEW=true;`)
      .replace("ADS+'/api/serve?placement=scraps", "ADS+'/api/ads-fair-serve?placement=scraps")
      .replace("async function event(ad,type,tags){return req(", "async function event(ad,type,tags){if(ADS_PREVIEW)return null;return req(");

    html = html.replace('</body>', `<div style="position:fixed;z-index:99999;right:12px;bottom:12px;padding:8px 10px;border-radius:999px;background:#1f1d19;color:#f8f4ea;font:700 10px/1 system-ui;box-shadow:0 6px 22px #0003">ADS PREVIEW / IMP OFF</div></body>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send(String(error?.message || error));
  }
}
