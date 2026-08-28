(() => {
  const ADS_MEDIA_API = 'https://design-stock-harf-way.vercel.app/api/ads-media';
  const ADS_DATA_HOST = 'ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech';
  const nativeFetch = window.fetch.bind(window);

  function isAdMediaInsert(url, method) {
    try {
      const u = new URL(url, location.href);
      return method === 'POST' && u.hostname === ADS_DATA_HOST && /\/ad_media\/?$/.test(u.pathname);
    } catch {
      return false;
    }
  }

  function mergedHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  async function requestText(input, init) {
    if (typeof init?.body === 'string') return init.body;
    if (input instanceof Request) return input.clone().text();
    return '';
  }

  function decodeBase64(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  let progressEl;
  function progress(message) {
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.dataset.hwAdsUpload = '1';
      Object.assign(progressEl.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
        zIndex: '2147483647', maxWidth: 'calc(100vw - 32px)', padding: '10px 14px',
        borderRadius: '999px', background: '#111', color: '#fff',
        font: '700 12px/1.4 system-ui,sans-serif', boxShadow: '0 8px 30px rgba(0,0,0,.24)'
      });
      document.documentElement.appendChild(progressEl);
    }
    progressEl.textContent = message;
  }

  function clearProgress() {
    progressEl?.remove();
    progressEl = undefined;
  }

  async function api(action, authorization, body) {
    const res = await nativeFetch(`${ADS_MEDIA_API}?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `素材保存に失敗しました (${res.status})`);
    return data;
  }

  async function uploadVideo(row, authorization) {
    const bytes = decodeBase64(String(row.data_base64 || ''));
    const metadata = {
      campaignId: row.campaign_id,
      fileName: row.file_name || 'video',
      contentType: row.mime_type || 'video/mp4',
      size: Number(row.size_bytes || bytes.byteLength)
    };
    if (!metadata.contentType.startsWith('video/')) return null;
    if (metadata.size !== bytes.byteLength) throw new Error('素材サイズの確認に失敗しました。');
    if (metadata.size > 10 * 1024 * 1024) throw new Error('動画は10MBまでです。');

    progress('広告動画を準備中…');
    const started = await api('start', authorization, metadata);
    const chunkBytes = Number(started.chunkBytes || 2500000);
    const parts = Math.ceil(bytes.byteLength / chunkBytes);

    for (let index = 0; index < parts; index += 1) {
      const part = index + 1;
      const start = index * chunkBytes;
      const end = Math.min(bytes.byteLength, start + chunkBytes);
      progress(`広告動画を保存中… ${part} / ${parts}`);
      const res = await nativeFetch(`${ADS_MEDIA_API}?action=part`, {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': metadata.contentType,
          'X-Campaign-Id': metadata.campaignId,
          'X-Upload-Id': started.uploadId,
          'X-Part-Number': String(part)
        },
        body: bytes.slice(start, end)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `動画の分割保存に失敗しました (${res.status})`);
    }

    progress('広告動画を仕上げています…');
    const completed = await api('complete', authorization, { ...metadata, uploadId: started.uploadId, parts });
    progress('広告動画を保存しました');
    setTimeout(clearProgress, 900);
    return completed;
  }

  window.fetch = async function harfwayAdsFetch(input, init) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!isAdMediaInsert(url, method)) return nativeFetch(input, init);

    try {
      const text = await requestText(input, init);
      const parsed = JSON.parse(text || '{}');
      const row = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!row?.campaign_id || !row?.data_base64 || !String(row.mime_type || '').startsWith('video/')) {
        return nativeFetch(input, init);
      }

      const authorization = mergedHeaders(input, init).get('authorization') || '';
      if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error('ログイン情報を確認できませんでした。');
      await uploadVideo(row, authorization);

      return new Response('', {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json', 'X-HARFWAY-MEDIA-STORAGE': 'r2' }
      });
    } catch (error) {
      clearProgress();
      console.error('[HARF-WAY ADS] R2 video upload failed', error);
      return new Response(JSON.stringify({ message: error instanceof Error ? error.message : '動画を保存できませんでした。' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
})();
