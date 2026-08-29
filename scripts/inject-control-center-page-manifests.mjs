import fs from 'node:fs';

const file='src/pages/control-center.astro';
let s=fs.readFileSync(file,'utf8');
let changed=false;

const replacements=[
  ["<small>Production v0.3</small>","<small>Production v0.4</small>"],
  ["これ以降の新規HUB IDは自動検出し、manifestまたは名称から4レーンへ分類します。","新規HUB IDに加え、既存Project配下の /harfway-tools.json も検出し、ページ単位で4レーンへ分類します。"],
  ["<code>/harfway-tool.json</code>","<code>/harfway-tool.json + /harfway-tools.json</code>"],
  ["fetch('/api/control-center-health').then(r=>r.json())","fetch('/api/control-center-health-pages').then(r=>r.json())"],
  ["Production v0.3 — AUTO SYNC稼働中。今後のHARF-WAY関連ツールはHUB新規ID＋harfway-tool.jsonを標準にし、CONTROL CENTERへ自動同期します。","Production v0.4 — PROJECT + PAGE AUTO SYNC。新規Projectはharfway-tool.json、既存Project内の複数ページはharfway-tools.jsonでCONTROL CENTERへ自動同期します。"]
];

for(const [from,to] of replacements){
  if(s.includes(from)){
    s=s.replace(from,to);
    changed=true;
  }
}

if(changed){
  fs.writeFileSync(file,s);
  console.log('[control-center-page-manifests] injected');
}else{
  console.log('[control-center-page-manifests] already injected or target not found');
}
