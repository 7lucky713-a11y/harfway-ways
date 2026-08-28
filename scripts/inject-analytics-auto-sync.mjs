import fs from 'node:fs';

const file='src/pages/analytics.astro';
let source=fs.readFileSync(file,'utf8');
const tag='<script src="/analytics-auto-sync.js"></script>';
if(!source.includes(tag)){
  if(!source.includes('</body>'))throw new Error('Analytics page closing body tag not found');
  source=source.replace('</body>',`${tag}\n</body>`);
  fs.writeFileSync(file,source);
  console.log('Injected Analytics AUTO SYNC client.');
}else{
  console.log('Analytics AUTO SYNC client already present.');
}
