import fs from 'node:fs';

const analyticsHtml=fs.readFileSync('dist/analytics/index.html','utf8');
const salesHtml=fs.readFileSync('dist/sales/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('public/harfway-tool.json','utf8'));
const checks=[
  [analyticsHtml.includes('/analytics-auto-sync.js'),'Analytics AUTO SYNC client missing from built page'],
  [salesHtml.includes('/ga4-sale-watch.js'),'SALE WATCH GA4 client missing from built page'],
  [manifest?.analytics?.enabled===true,'harfway-tool.json analytics.enabled must be true'],
  [Boolean(manifest?.analytics?.service_name),'harfway-tool.json analytics.service_name missing'],
  [Boolean(manifest?.analytics?.production_url),'harfway-tool.json analytics.production_url missing']
];
for(const [ok,message] of checks)if(!ok)throw new Error(message);
console.log('HARF-WAY Analytics AUTO SYNC guard OK. SALE WATCH GA4 guard OK.');
