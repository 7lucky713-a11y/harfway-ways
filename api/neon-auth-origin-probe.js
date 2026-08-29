const UPSTREAM='https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth/sign-in/email';
const ORIGINS=['https://harfway-playback.vercel.app','https://harfway-playback-harf-way.vercel.app'];

async function probe(label,headers){
  const r=await fetch(UPSTREAM,{method:'POST',headers:{'content-type':'application/json','accept':'application/json',...headers},body:JSON.stringify({email:'probe-invalid@invalid.example',password:'definitely-not-valid'})});
  const text=await r.text();
  return {label,status:r.status,invalidOrigin:/invalid origin/i.test(text),bodyClass:/invalid origin/i.test(text)?'invalid_origin':(/invalid|credential|password|user|email/i.test(text)?'auth_rejected':'other')};
}

export default async function handler(req,res){
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({ok:false});
  if(req.method!=='GET') return res.status(405).json({ok:false});
  try{
    const tests=[];
    for(const origin of ORIGINS){
      tests.push(await probe(`origin:${origin}`,{origin,referer:`${origin}/ads-admin/`}));
      tests.push(await probe(`forwarded:${origin}`,{origin,referer:`${origin}/ads-admin/`,'x-forwarded-host':new URL(origin).host,'x-forwarded-proto':'https'}));
    }
    return res.status(200).json({ok:true,tests});
  }catch(error){return res.status(500).json({ok:false,error:'probe_failed'});}
}
