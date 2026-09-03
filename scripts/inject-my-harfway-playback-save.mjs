import fs from 'node:fs/promises';

const SAVE_SCRIPT='/my-harfway-playback-save.js';
const OPEN_SCRIPT='/my-harfway-open-link.js';
const targets=[
  {file:'src/pages/index.astro',tags:[`<script is:inline src="${OPEN_SCRIPT}"></script>`]},
  {file:'src/pages/sales.astro',tags:[`<script is:inline src="${SAVE_SCRIPT}"></script>`,`<script is:inline src="${OPEN_SCRIPT}"></script>`]},
  {file:'public/scrapbook/index.html',tags:[`<script src="${SAVE_SCRIPT}"></script>`,`<script src="${OPEN_SCRIPT}"></script>`]},
];

for(const target of targets){
  let html=await fs.readFile(target.file,'utf8');
  for(const tag of target.tags){
    if(!html.includes(tag)){
      if(!html.includes('</body>'))throw new Error(`${target.file}: body closing tag missing`);
      html=html.replace('</body>',`${tag}\n</body>`);
    }
  }
  await fs.writeFile(target.file,html,'utf8');
  for(const tag of target.tags){
    if(!html.includes(tag))throw new Error(`${target.file}: MY HARF-WAY UI injection missing`);
  }
}
console.log('[my-harfway-playback-save] WAYS + Scraps + Sale MY HARF-WAY entry links enabled');
