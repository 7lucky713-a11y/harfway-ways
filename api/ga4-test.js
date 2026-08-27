import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

const requiredEnv = [
  'GA4_PROPERTY_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(503).json({ ok: false, error: 'missing_environment_variables', missing });
  }

  const {
    GA4_PROPERTY_ID,
    GCP_PROJECT_NUMBER,
    GCP_WORKLOAD_IDENTITY_POOL_ID,
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    GCP_SERVICE_ACCOUNT_EMAIL,
  } = process.env;

  const providerResource = `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`;
  const oidcAudience = `https://iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`;

  try {
    const authClient = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: providerResource,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: () => getVercelOidcToken({ audience: oidcAudience }),
      },
    });

    if (!authClient) throw new Error('failed_to_create_external_account_client');

    const tokenResult = await authClient.getAccessToken();
    const accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
    if (!accessToken) throw new Error('failed_to_get_google_access_token');

    const gaResponse = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        }),
      },
    );

    const payload = await gaResponse.json().catch(() => ({}));

    if (!gaResponse.ok) {
      console.error('[ga4-data-api]', {
        status: gaResponse.status,
        code: payload?.error?.code,
        statusText: payload?.error?.status,
        message: payload?.error?.message,
      });
      return res.status(gaResponse.status).json({
        ok: false,
        stage: 'ga4_data_api',
        error: payload?.error?.message || 'ga4_request_failed',
        code: payload?.error?.code || gaResponse.status,
      });
    }

    const values = payload?.rows?.[0]?.metricValues || [];
    return res.status(200).json({
      ok: true,
      environment: process.env.VERCEL_ENV || 'unknown',
      property_id: GA4_PROPERTY_ID,
      range: 'last_7_days',
      metrics: {
        screenPageViews: Number(values?.[0]?.value || 0),
        activeUsers: Number(values?.[1]?.value || 0),
      },
      oidc: 'connected',
      google_cloud: 'connected',
      ga4_data_api: 'connected',
    });
  } catch (error) {
    console.error('[ga4-oidc-test]', error);
    return res.status(500).json({
      ok: false,
      stage: 'oidc_or_google_auth',
      error: error?.message || String(error),
    });
  }
}
