import {getVercelOidcToken} from '@vercel/oidc';
import {ExternalAccountClient} from 'google-auth-library';

const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const DATA_API='https://analyticsdata.googleapis.com/v1beta';

function config(){
  return {
    propertyId:String(process.env.GA4_PROPERTY_ID||'').trim().replace(/^properties\//,''),
    projectNumber:String(process.env.GCP_PROJECT_NUMBER||'').trim(),
    poolId:String(process.env.GCP_WORKLOAD_IDENTITY_POOL_ID||'').trim(),
    providerId:String(process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID||'').trim(),
    serviceAccountEmail:String(process.env.GCP_SERVICE_ACCOUNT_EMAIL||'').trim(),
  };
}

async function getToken(c){
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
  const access=await authClient?.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token)throw new Error('access_token_missing');
  return token;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const c=config();
    const token=await getToken(c);
    const response=await fetch(`${DATA_API}/properties/${c.propertyId}:runReport`,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({
        dateRanges:[{startDate:'90daysAgo',endDate:'today'}],
        dimensions:[{name:'hostName'}],
        metrics:[{name:'screenPageViews'},{name:'sessions'},{name:'activeUsers'}],
        orderBys:[{metric:{metricName:'screenPageViews'},desc:true}],
        limit:200
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error?.message||`ga4_${response.status}`);
    const hosts=(data.rows||[]).map(row=>({
      host:row.dimensionValues?.[0]?.value||'',
      pageViews:Number(row.metricValues?.[0]?.value||0),
      sessions:Number(row.metricValues?.[1]?.value||0),
      activeUsers:Number(row.metricValues?.[2]?.value||0)
    }));
    console.log('[ga4-host-audit]',JSON.stringify(hosts));
    return res.status(200).json({ok:true,period:'last_90_days',hosts});
  }catch(error){
    console.error('[ga4-host-audit-error]',error?.message||error);
    return res.status(500).json({ok:false,error:error?.message||String(error)});
  }
}
