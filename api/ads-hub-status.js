const ENDPOINTS = {
  admin: 'https://harfway-ads-admin.vercel.app/',
  delivery: 'https://harfway-ads-delivery.vercel.app/',
  deliveryServe: 'https://harfway-ads-delivery.vercel.app/api/serve',
  placements: 'https://harfway-ads-placement-dashboard.vercel.app/',
  placementStats: 'https://harfway-ads-placement-dashboard.vercel.app/api/stats?days=7',
};

async function probe(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'user-agent': 'HARF-WAY-ADS-HUB/1.0',
      },
    });

    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      body: text.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
      body: '',
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const [admin, delivery, deliveryServe, placements, placementStats] = await Promise.all([
    probe(ENDPOINTS.admin),
    probe(ENDPOINTS.delivery),
    probe(ENDPOINTS.deliveryServe),
    probe(ENDPOINTS.placements),
    probe(ENDPOINTS.placementStats),
  ]);

  const deliverySemanticOk = deliveryServe.status === 400 && /invalid placement/i.test(deliveryServe.body || '');
  const metricsProtected = placementStats.status === 401 || placementStats.status === 403;
  const placementMetrics = placementStats.ok ? parseJson(placementStats.body) : null;

  const services = {
    admin: {
      label: '広告管理',
      ok: admin.ok,
      status: admin.status,
      latencyMs: admin.latencyMs,
      mode: 'preview',
    },
    delivery: {
      label: '配信API',
      ok: delivery.ok && deliverySemanticOk,
      status: delivery.status,
      latencyMs: Math.max(delivery.latencyMs || 0, deliveryServe.latencyMs || 0),
      serveStatus: deliveryServe.status,
      semanticCheck: deliverySemanticOk ? 'invalid_placement_expected' : 'unexpected_response',
      mode: 'production',
    },
    placements: {
      label: '配信状況',
      ok: placements.ok && (metricsProtected || placementStats.ok),
      status: placements.status,
      latencyMs: Math.max(placements.latencyMs || 0, placementStats.latencyMs || 0),
      metricsAccess: metricsProtected ? 'protected' : placementStats.ok ? 'available' : 'unavailable',
      metricsStatus: placementStats.status,
      mode: 'production',
    },
  };

  const values = Object.values(services);
  const online = values.filter((service) => service.ok).length;

  return res.status(200).json({
    ok: online === values.length,
    generatedAt: new Date().toISOString(),
    online,
    total: values.length,
    services,
    metrics: placementMetrics,
    metricsState: metricsProtected ? 'login_required' : placementStats.ok ? 'available' : 'unavailable',
  });
}
