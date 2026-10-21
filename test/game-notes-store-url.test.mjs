import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL_ENV = 'preview';
process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL = 'postgresql://unused';

let activeSql;
mock.module('@neondatabase/serverless', { exports: { neon: () => activeSql } });
mock.module(new URL('../api/archive-core.js', import.meta.url).href, {
  exports: {
    archiveCors: () => {},
    archiveDatabaseConfig: () => ({ url: '' }),
    authorizeArchiveRequest: async () => ({ ok: true })
  }
});
const { default: handler } = await import('../api/game-notes-note-v2.js');

function database(existing = {}, published = true) {
  const writes = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes("current_setting('neon.project_id'")) {
      return [{ project_id: 'wispy-recipe-34518010', branch_id: 'br-bold-butterfly-aw2ztgbd', contents_table: 'core.contents' }];
    }
    if (query.includes('SELECT metadata FROM core.contents')) return [{ metadata: existing }];
    if (query.includes('SELECT id FROM core.contents')) {
      return values.includes('private_game_note_facet') ? [] : [{ id: 'exists' }];
    }
    if (query.includes('INSERT INTO core.contents')) {
      const metadata = JSON.parse(values.find(value => typeof value === 'string' && value.startsWith('{')));
      writes.push({ kind: 'private', metadata });
      return [{ id: 'game-notes:note:example', title: 'Example', body_text: 'Body', metadata }];
    }
    if (query.includes('UPDATE core.contents')) {
      writes.push({ kind: 'public', values });
      return published ? [{ id: 'game-notes:public-note:example' }] : [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  return { sql, writes };
}

async function save(body, existing) {
  const db = database(existing);
  activeSql = db.sql;
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; }
  };
  await handler({ method: 'PATCH', body: { entity: 'note', id: 'example', gameId: 'game', typeId: 'memo', title: 'Example', body: 'Body', media: [], ...body } }, response);
  return { response, writes: db.writes };
}

test('the routed note save persists and publishes a store URL', async () => {
  const url = 'https://store.steampowered.com/app/123/';
  const { response, writes } = await save({
    storeUrl: url,
    gameId: 'a10e6a8c-95a7-4480-adcb-bf6f8c8054e2',
    monsterTrainRun: { reachedStage: 5 }
  }, {});
  assert.equal(response.code, 200);
  assert.equal(response.data.item.storeUrl, url);
  assert.equal(response.data.publicStoreLinkSync, 'synced');
  assert.equal(writes[0].metadata.storeUrl, url);
  assert.equal(writes[0].metadata.gameSpecific.monsterTrain2.reachedStage, 5);
  assert.equal(writes[1].values.includes(url), true);
  assert.equal(writes[1].values.includes('game-notes:public-note:example'), true);
});

test('clearing the field removes the published store URL', async () => {
  const { response, writes } = await save({ storeUrl: '' }, { storeUrl: 'https://store.steampowered.com/app/123/' });
  assert.equal(response.code, 200);
  assert.equal(writes[0].metadata.storeUrl, '');
  assert.equal(writes[1].values.includes(''), true);
});

test('older clients preserve the stored URL, and unsafe URLs are rejected', async () => {
  const current = 'https://store.steampowered.com/app/123/';
  const preserved = await save({}, { storeUrl: current });
  assert.equal(preserved.response.code, 200);
  assert.equal(preserved.writes[0].metadata.storeUrl, current);

  const invalid = await save({ storeUrl: 'javascript:alert(1)' }, { storeUrl: current });
  assert.equal(invalid.response.code, 400);
  assert.equal(invalid.response.data.error, 'store_url_must_be_https');
  assert.equal(invalid.writes.length, 0);
});
