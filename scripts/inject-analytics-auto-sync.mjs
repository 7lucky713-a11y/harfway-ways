import fs from 'node:fs';

function inject(file,tag,label){
  let source=fs.readFileSync(file,'utf8');
  if(!source.includes(tag)){
    if(!source.includes('</body>'))throw new Error(`${label} closing body tag not found`);
    source=source.replace('</body>',`${tag}\n</body>`);
    fs.writeFileSync(file,source);
    console.log(`Injected ${label}.`);
  }else{
    console.log(`${label} already present.`);
  }
}

inject('src/pages/analytics.astro','<script is:inline src="/analytics-auto-sync.js"></script>','Analytics AUTO SYNC client');
inject('src/pages/sales.astro','<script is:inline src="/ga4-sale-watch.js"></script>','SALE WATCH GA4 client');
