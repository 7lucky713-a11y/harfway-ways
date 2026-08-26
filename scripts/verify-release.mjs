import gamesLive from '../api/games-live.js';
import analytics from '../api/analytics.js';

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let settled = false;
    const finish = (body) => {
      if (settled) return;
      settled = true;
      resolve({ status: statusCode, body });
    };
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { statusCode = code; return this; },
      json(body) { finish(body); return this; },
      end(body) {
        let parsed = body;
        if (typeof body === 'string') {
          try { parsed = JSON.parse(body); } catch {}
        }
        finish(parsed);
        return this;
      }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const games = await invoke(gamesLive, { method: 'GET', query: {} });
const entries = Array.isArray(games.body?.entries) ? games.body.entries : [];
const hasFlywrench = entries.some(game => game?.title === 'Flywrench');
if (games.status !== 200 || games.body?.source !== 'playback-editor-live' || entries.length < 39 || !hasFlywrench) {
  throw new Error(`games-live verification failed: status=${games.status} source=${games.body?.source || 'none'} count=${entries.length} flywrench=${hasFlywrench}`);
}

const metrics = await invoke(analytics, { method: 'GET', query: { days: '7' } });
if (metrics.status !== 200 || metrics.body?.ok !== true) {
  throw new Error(`analytics verification failed: status=${metrics.status} ok=${metrics.body?.ok}`);
}

console.log(`[verify-release] games-live OK source=${games.body.source} count=${entries.length} flywrench=${hasFlywrench}`);
console.log(`[verify-release] analytics OK days=${metrics.body?.days ?? 7}`);
// rerun after Preview env update
