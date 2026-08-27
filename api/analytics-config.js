const ID_RE=/^G-[A-Z0-9]+$/i;

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const raw=String(process.env.GA4_MEASUREMENT_ID||'').trim().toUpperCase();
  const measurementId=ID_RE.test(raw)?raw:'';
  return res.status(200).json({
    ok:true,
    enabled:Boolean(measurementId),
    measurementId,
    version:'harfway-ga4-v0.1'
  });
}
