const MCP_URL = 'https://mcp.fanatical.com/mcp';
const AWIN_ADVERTISER_ID = '118821';
const AWIN_PUBLISHER_ID = '3107261';
const MAX_APPIDS = 100;
const BATCH_SIZE = 20;

function parseSseJson(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:'));
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i].slice(5).trim()); } catch {}
  }
  return null;
}

async function mcpPost(body, sessionId = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'user-agent': 'HARF-WAY-Sale-Watch-Fanatical/1.0'
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store'
    });
    const text = await response.text();
    if (response.status >= 400) throw new Error('fanatical_mcp_http_' + response.status);
    return {
      status: response.status,
      sessionId: response.headers.get('mcp-session-id') || sessionId,
      data: parseSseJson(text)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function openSession() {
  const init = await mcpPost({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'harfway-sale-watch', version: '1.0' }
    }
  });
  if (!init.sessionId || !init.data?.result) throw new Error('fanatical_mcp_init_failed');
  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, init.sessionId);
  return init.sessionId;
}

function callPayload(id, appids) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'get_products',
      arguments: {
        steam_ids: appids.map(Number),
        region: 'JP',
        include_related: false
      }
    }
  };
}

function unwrapToolResult(message) {
  const text = message?.result?.content?.find(item => item?.type === 'text')?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function awinDeepLink(destinationUrl, appid) {
  const url = new URL('https://www.awin1.com/cread.php');
  url.searchParams.set('awinmid', AWIN_ADVERTISER_ID);
  url.searchParams.set('awinaffid', AWIN_PUBLISHER_ID);
  url.searchParams.set('clickref', 'sale-watch');
  url.searchParams.set('clickref2', String(appid));
  url.searchParams.set('ued', destinationUrl);
  return url.toString();
}

function unixIso(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function normalizeProduct(product, currency) {
  const appid = String(product?.steam_id || '');
  if (!/^\d+$/.test(appid)) return null;
  const basePrice = Number(product?.price);
  const fullPrice = Number(product?.full_price);
  const couponPrice = Number(product?.coupon?.coupon_price);
  const hasCouponPrice = Number.isFinite(couponPrice);
  const effectivePrice = hasCouponPrice ? couponPrice : basePrice;
  let discountPercent = Number(product?.discount_percent || 0);
  if (hasCouponPrice && Number.isFinite(fullPrice) && fullPrice > 0) {
    discountPercent = Math.max(discountPercent, Math.round((1 - effectivePrice / fullPrice) * 100));
  }
  const destinationUrl = String(product?.url || '');
  return {
    ok: true,
    appid,
    name: String(product?.name || ''),
    currency: String(currency || 'JPY'),
    price: Number.isFinite(effectivePrice) ? effectivePrice : null,
    basePrice: Number.isFinite(basePrice) ? basePrice : null,
    fullPrice: Number.isFinite(fullPrice) ? fullPrice : null,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    onSale: Number.isFinite(effectivePrice) && Number.isFinite(fullPrice) && effectivePrice < fullPrice,
    inStock: product?.in_stock !== false,
    drm: String(product?.drm || ''),
    saleName: String(product?.sale_name || ''),
    couponCode: String(product?.coupon?.code || ''),
    validUntil: unixIso(product?.coupon?.valid_until || product?.valid_until),
    lastModified: unixIso(product?.last_modified),
    sourceUrl: destinationUrl,
    affiliateUrl: destinationUrl ? awinDeepLink(destinationUrl, appid) : '',
    source: 'fanatical-mcp'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const raw = String(req.query?.appids || '');
  const appids = [...new Set(raw.split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v)))].slice(0, MAX_APPIDS);
  if (!appids.length) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, country: 'JP', currency: 'JPY', appids: [], products: {} });
  }

  let sessionId = '';
  try {
    sessionId = await openSession();
    const products = {};
    let callId = 10;
    for (let i = 0; i < appids.length; i += BATCH_SIZE) {
      const batch = appids.slice(i, i + BATCH_SIZE);
      const call = await mcpPost(callPayload(callId++, batch), sessionId);
      const payload = unwrapToolResult(call.data);
      for (const product of payload?.products || []) {
        const normalized = normalizeProduct(product, payload?.currency);
        if (normalized) products[normalized.appid] = normalized;
      }
    }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      country: 'JP',
      currency: 'JPY',
      updatedAt: new Date().toISOString(),
      appids,
      matched: Object.keys(products).length,
      products
    });
  } catch (error) {
    console.error('[fanatical-prices-public]', error?.message || error);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(503).json({ ok: false, error: 'fanatical_prices_unavailable' });
  }
}
