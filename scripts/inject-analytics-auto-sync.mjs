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

function stripPreviewLabelsForProduction(){
  if(process.env.VERCEL_ENV!=='production')return;
  const targets=[
    ['src/pages/salvage/index.astro','HARF-WAY / ARCHIVE SALVAGER v1.1 PREVIEW','HARF-WAY / ARCHIVE SALVAGER v1.1'],
    ['src/pages/salvage/store-edit.astro','HARF-WAY / GAME LINKS v1.0 PREVIEW','HARF-WAY / GAME LINKS v1.0']
  ];
  for(const [file,from,to] of targets){
    let source=fs.readFileSync(file,'utf8');
    if(!source.includes(from))continue;
    source=source.replaceAll(from,to);
    fs.writeFileSync(file,source);
    console.log(`Removed Preview label for production: ${file}`);
  }
}

stripPreviewLabelsForProduction();
inject('src/pages/analytics.astro','<script is:inline src="/analytics-auto-sync.js"></script>','Analytics AUTO SYNC client');
inject('src/pages/sales.astro','<script is:inline src="/ga4-sale-watch.js"></script>','SALE WATCH GA4 client');
inject('src/pages/salvage/store-edit.astro','<script is:inline src="/game-links-unlinked-filter.js"></script>','GAME LINKS unlinked filter');
