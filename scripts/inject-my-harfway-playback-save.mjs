import fs from 'node:fs/promises';

const PUBLIC_SCRIPT='/my-harfway-playback-save.js';
const targets=[
  {file:'src/pages/sales.astro',tag:`<script is:inline src="${PUBLIC_SCRIPT}"></script>`},
  {file:'public/scrapbook/index.html',tag:`<script src="${PUBLIC_SCRIPT}"></script>`},
];

for(const target of targets){
  let html=await fs.readFile(target.file,'utf8');
  if(!html.includes(target.tag)){
    if(!html.includes('</body>'))throw new Error(`${target.file}: body closing tag missing`);
    html=html.replace('</body>',`${target.tag}\n</body>`);
    await fs.writeFile(target.file,html,'utf8');
  }
  if(!html.includes(target.tag))throw new Error(`${target.file}: MY HARF-WAY take-home injection missing`);
}
console.log('[my-harfway-playback-save] Scraps + Sale take-home UI enabled');
