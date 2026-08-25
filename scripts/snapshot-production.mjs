import { mkdir, writeFile } from 'node:fs/promises';

const targets = [
  ['https://harfway-playback.vercel.app/', 'snapshot/index.html'],
  ['https://harfway-playback.vercel.app/archive/', 'snapshot/archive/index.html'],
];

for (const [url, path] of targets) {
  const res = await fetch(url, { headers: { 'user-agent': 'HARF-WAY Git snapshot' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  let html = await res.text();
  html = html.replace("const API='/api/games';", "const API='https://harfway-playback.vercel.app/api/games';");
  await mkdir(path.split('/').slice(0, -1).join('/'), { recursive: true });
  await writeFile(path, html, 'utf8');
  console.log(`snapshotted ${url} -> ${path} (${html.length} chars)`);
}
