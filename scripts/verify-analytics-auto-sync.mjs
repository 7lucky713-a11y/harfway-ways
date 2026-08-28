import fs from 'node:fs';

const analyticsHtml=fs.readFileSync('dist/analytics/index.html','utf8');
const salesHtml=fs.readFileSync('dist/sales/index.html','utf8');
const waysHtml=fs.readFileSync('dist/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('public/harfway-tool.json','utf8'));
const checks=[
  [analyticsHtml.includes('/analytics-auto-sync.js'),'Analytics AUTO SYNC client missing from built page'],
  [salesHtml.includes('/api/sale-price-snapshot'),'SALE WATCH direct price snapshot path missing from built page'],
  [!salesHtml.includes('/api/steam-prices-public?appids='),'SALE WATCH legacy chunk price loop still present'],
  [salesHtml.includes('/ga4-sale-watch.js'),'SALE WATCH GA4 client missing from built page'],
  [salesHtml.includes('/sale-watch-ways-deeplink.js'),'SALE WATCH WAYS deep-link client missing from built page'],
  [waysHtml.includes('/ways-deeplink.js'),'WAYS Steam deep-link client missing from built page'],
  [fs.existsSync('dist/ways-deeplink.js'),'WAYS deep-link asset missing from dist'],
  [fs.existsSync('dist/sale-watch-ways-deeplink.js'),'SALE WATCH deep-link asset missing from dist'],
  [manifest?.analytics?.enabled===true,'harfway-tool.json analytics.enabled must be true'],
  [Boolean(manifest?.analytics?.service_name),'harfway-tool.json analytics.service_name missing'],
  [Boolean(manifest?.analytics?.production_url),'harfway-tool.json analytics.production_url missing']
];
for(const [ok,message] of checks)if(!ok)throw new Error(message);
console.log('HARF-WAY Analytics guards OK. SALE WATCH direct snapshot + WAYS deep-link guards OK.');
