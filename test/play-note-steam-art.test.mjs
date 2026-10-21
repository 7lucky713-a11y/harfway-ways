import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { steamNoteStoreAppId, steamNoteStoreImageUrl } from '../lib/note-store-link.js';
import handler, { resolveSteamHeaderImage } from '../api/play-note-steam-art.js';

const DICEVADERS_IMAGE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3917700/55e95c6c3ad95fbe93d519e3df67245e5f6a0b6c/header.jpg?t=1791626439';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(data) { this.body = data; return this; },
    end() { return this; },
  };
}

test('only Steam app pages create an artwork request', () => {
  const url = 'https://store.steampowered.com/app/3917700/Dicevaders/?l=japanese';
  assert.equal(steamNoteStoreAppId(url), '3917700');
  assert.equal(steamNoteStoreImageUrl(url), '/api/play-note-steam-art?appid=3917700');
  assert.equal(steamNoteStoreImageUrl('https://store.steampowered.com/agecheck/app/3917700/'), '/api/play-note-steam-art?appid=3917700');
  assert.equal(steamNoteStoreImageUrl('https://store.steampowered.com/bundle/123/'), '');
  assert.equal(steamNoteStoreImageUrl('https://itch.io/'), '');
});

test('the Steam API returns a hashed image path for Dicevaders', async () => {
  const image = await resolveSteamHeaderImage('3917700', async (url) => {
    assert.match(url, /appids=3917700/);
    return { ok: true, json: async () => ({ 3917700: { success: true, data: { header_image: DICEVADERS_IMAGE } } }) };
  });
  assert.equal(image, DICEVADERS_IMAGE);
});

test('the artwork redirect uses the API URL and CDN caching', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ 3917700: { success: true, data: { header_image: DICEVADERS_IMAGE } } }),
  }));
  try {
    const res = response();
    await handler({ method: 'GET', query: { appid: '3917700' } }, res);
    assert.equal(res.code, 302);
    assert.equal(res.headers.Location, DICEVADERS_IMAGE);
    assert.match(res.headers['Cache-Control'], /s-maxage=21600/);
  } finally { fetchMock.mock.restore(); }
});

test('unsafe upstream URLs are rejected and transient errors use the old fallback', async () => {
  for (const candidate of [
    'https://evil.example/steam/apps/3917700/header.jpg',
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/999/header.jpg',
    'javascript:alert(1)',
  ]) {
    const value = await resolveSteamHeaderImage('3917700', async () => ({
      ok: true,
      json: async () => ({ 3917700: { success: true, data: { header_image: candidate } } }),
    }));
    assert.equal(value, '');
  }

  const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429 }));
  try {
    const res = response();
    await handler({ method: 'GET', query: { appid: '3917700' } }, res);
    assert.equal(res.code, 302);
    assert.equal(res.headers.Location, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3917700/header.jpg');
    assert.match(res.headers['Cache-Control'], /s-maxage=300/);
  } finally { fetchMock.mock.restore(); }
});

test('invalid app ids never cause a Steam lookup', async () => {
  const res = response();
  await handler({ method: 'GET', query: { appid: '3917700/../../etc' } }, res);
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'invalid_appid');
});
