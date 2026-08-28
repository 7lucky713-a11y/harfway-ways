import fs from 'node:fs';

const html=fs.readFileSync('dist/analytics/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('public/harfway-tool.json','utf8'));
const checks=[
  [html.includes('/analytics-auto-sync.js'),'Analytics AUTO SYNC client missing from built page'],
  [manifest?.analytics?.enabled===true,'harfway-tool.json analytics.enabled must be true'],
  [Boolean(manifest?.analytics?.service_name),'harfway-tool.json analytics.service_name missing'],
  [Boolean(manifest?.analytics?.production_url),'harfway-tool.json analytics.production_url missing']
];
for(const [ok,message] of checks)if(!ok)throw new Error(message);
console.log('HARF-WAY Analytics AUTO SYNC guard OK.');
