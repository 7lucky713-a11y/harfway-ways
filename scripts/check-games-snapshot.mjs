import handler from '../api/games.js';

const req = { method: 'GET' };
const res = {
  statusCode: 200,
  payload: null,
  setHeader() {},
  status(code) { this.statusCode = code; return this; },
  json(value) { this.payload = value; return this; },
  end(value) { this.payload = value; return this; }
};

handler(req, res);
const p = res.payload;
if (res.statusCode !== 200 || !p?.ok || p.count !== 38 || p.entries?.length !== 38) {
  throw new Error(`games snapshot invalid: ${res.statusCode} ${JSON.stringify({ok:p?.ok,count:p?.count,length:p?.entries?.length})}`);
}
if (p.entries[0]?.title !== 'Headbangers: Rhythm Royale') throw new Error('first game mismatch');
if (p.entries[37]?.title !== '脱出ゲーム 密の湯温泉 ～幻の温泉宿からの脱出～') throw new Error('last game mismatch');
console.log('[games-snapshot-check]', { ok:true, count:p.count, first:p.entries[0].title, last:p.entries[37].title });
