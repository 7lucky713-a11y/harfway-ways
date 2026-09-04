import waysShareHandler from './ways-share.js';

const PROD_ORIGIN = 'https://harfway-playback.vercel.app';

function queryValue(value, fallback = '') {
  return String(Array.isArray(value) ? value[0] : (value ?? fallback)).trim();
}

function versionFromImageUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    const file = url.pathname.split('/').filter(Boolean).pop() || '1';
    return file.slice(0, 180);
  } catch {
    return '1';
  }
}

function rewriteSocialImage(html, id) {
  const sourceMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/) || html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!sourceMatch) return { html, proxyUrl: '' };

  const version = versionFromImageUrl(sourceMatch[1]);
  const proxyUrl = `${PROD_ORIGIN}/share-image/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`;
  const nextHtml = html
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${proxyUrl}$2`)
    .replace(/(<meta property="og:image:secure_url" content=")[^"]*(")/, `$1${proxyUrl}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${proxyUrl}$2`);

  return { html: nextHtml, proxyUrl };
}

function createCapture() {
  const headers = new Map();
  let statusCode = 200;
  let body = '';

  const capture = {
    setHeader(name, value) {
      headers.set(String(name), value);
      return this;
    },
    status(code) {
      statusCode = Number(code) || 200;
      return this;
    },
    end(value = '') {
      body = value;
      return this;
    },
    send(value = '') {
      body = value;
      return this;
    },
    json(value) {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      body = JSON.stringify(value);
      return this;
    }
  };

  return {
    capture,
    result() { return { headers, statusCode, body }; }
  };
}

export default async function handler(req, res) {
  const id = queryValue(req.query?.id);
  const recorder = createCapture();

  try {
    await waysShareHandler(req, recorder.capture);
    const { headers, statusCode, body } = recorder.result();

    for (const [name, value] of headers) res.setHeader(name, value);

    if (statusCode !== 200 || typeof body !== 'string' || !id) {
      return res.status(statusCode).end(body);
    }

    const rewritten = rewriteSocialImage(body, id);
    if (rewritten.proxyUrl) res.setHeader('X-Ways-Social-Image', rewritten.proxyUrl);
    return res.status(statusCode).end(rewritten.html);
  } catch (error) {
    console.error('[ways-share-social]', error?.message || error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('<!doctype html><meta charset="utf-8"><title>WAYS / TEMPORARILY UNAVAILABLE</title>');
  }
}
