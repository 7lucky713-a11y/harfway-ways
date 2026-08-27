import {getVercelOidcToken} from '@vercel/oidc';
import {ExternalAccountClient} from 'google-auth-library';

const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const DATA_API='https://analyticsdata.googleapis.com/v1beta';

function credentials(){
  return {
    propertyId:String(process.env.GA4_PROPERTY_ID||'').trim().replace(/^properties\//,''),
    projectNumber:String(process.env.GCP_PROJECT_NUMBER||'').trim(),
    poolId:String(process.env.GCP_WORKLOAD_IDENTITY_POOL_ID||'').trim(),
    providerId:String(process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID||'').trim(),
    serviceAccountEmail:String(process.env.GCP_SERVICE_ACCOUNT_EMAIL||'').trim()
  };
}

async function accessToken(c){
  const audience=`//iam.googleapis.com/projects/${c.projectNumber}/locations/global/workloadIdentityPools/${c.poolId}/providers/${c.providerId}`;
  const authClient=ExternalAccountClient.fromJSON({
    type:'external_account',
    audience,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${c.serviceAccountEmail}:generateAccessToken`,
    scopes:[SCOPE],
    subject_token_supplier:{getSubjectToken:()=>getVercelOidcToken()}
  });
  const access=await authClient.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token)throw new Error('access_token_missing');
  return token;
}

async function realtime(propertyId,token,body){
  const response=await fetch(`${DATA_API}/properties/${encodeURIComponent(propertyId)}:runRealtimeReport`,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`ga4_${response.status}`);
  return data;
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const c=credentials();
    if(!c.propertyId||!c.projectNumber||!c.poolId||!c.providerId||!c.serviceAccountEmail){
      return res.status(500).json({ok:false,error:'missing_env'});
    }
    const token=await accessToken(c);
    const [pages,events]=await Promise.all([
      realtime(c.propertyId,token,{
        dimensions:[{name:'unifiedScreenName'}],
        metrics:[{name:'screenPageViews'},{name:'activeUsers'}],
        limit:100
      }),
      realtime(c.propertyId,token,{
        dimensions:[{name:'eventName'}],
        metrics:[{name:'eventCount'}],
        limit:100
      })
    ]);
    const pageRows=(pages.rows||[]).map(row=>({
      title:String(row.dimensionValues?.[0]?.value||''),
      screenPageViews:Number(row.metricValues?.[0]?.value||0),
      activeUsers:Number(row.metricValues?.[1]?.value||0)
    }));
    const eventRows=(events.rows||[]).map(row=>({
      event:String(row.dimensionValues?.[0]?.value||''),
      eventCount:Number(row.metricValues?.[0]?.value||0)
    }));
    console.log('[ga4-realtime-audit]',JSON.stringify({pages:pageRows,events:eventRows}));
    return res.status(200).json({ok:true,pages:pageRows,events:eventRows});
  }catch(error){
    console.error('[ga4-realtime-audit]',error?.message||error);
    return res.status(500).json({ok:false,error:error?.message||'ga4_realtime_error'});
  }
}
