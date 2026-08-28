const DATA_API='https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const base64Bytes=Math.ceil((10*1024*1024)/3)*4;
const body=JSON.stringify({placement:'playback',probe_only:'x'.repeat(base64Bytes)});
try{
  const r=await fetch(`${DATA_API}/rpc/ad_pick_campaign_v2`,{method:'POST',headers:{'content-type':'application/json'},body});
  const text=await r.text();
  console.log(`[ADS_NEON_PAYLOAD_PROBE] sent=${Buffer.byteLength(body)} status=${r.status} gatewayAccepted=${r.status!==413} response=${text.slice(0,180).replace(/\s+/g,' ')}`);
}catch(e){
  console.log(`[ADS_NEON_PAYLOAD_PROBE] sent=${Buffer.byteLength(body)} fetchError=${String(e?.message||e)}`);
}
