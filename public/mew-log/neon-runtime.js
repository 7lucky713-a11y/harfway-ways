(() => {
  const API = '/api/mew-log';
  const MEDIA_API = '/api/mew-log-media';
  const LOCAL_KEY = 'mewlog_entries_v1';
  const ADMIN_KEY_STORAGE = 'mewlog_admin_key';
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
  const isAdmin = location.pathname.includes('/mew-log/admin');
  let productionMode = false;
  let storageMode = '';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function mediaSrc(value) {
    try {
      const url = new URL(String(value || ''), location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function mediaKind(type, url = '') {
    const mime = String(type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    const path = String(url || '').toLowerCase().split('?')[0];
    if (/\.(jpe?g|png|webp|gif)$/.test(path)) return 'image';
    if (/\.(mp4|webm)$/.test(path)) return 'video';
    return '';
  }

  function mediaMarkup(entry, className = '') {
    const src = mediaSrc(entry?.mediaUrl);
    if (!src) return '';
    const kind = mediaKind(entry?.mediaType, src);
    if (kind === 'image') return `<img class="${esc(className)}" src="${esc(src)}" alt="${esc(entry?.title || '')}" loading="lazy" />`;
    if (kind === 'video') return `<video class="${esc(className)}" controls playsinline preload="metadata" src="${esc(src)}"></video>`;
    return '';
  }

  function localEntries() {
    try {
      const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function storedAdminKey() {
    try { return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''; } catch { return ''; }
  }

  function clearAdminKey() {
    try { sessionStorage.removeItem(ADMIN_KEY_STORAGE); } catch {}
  }

  function requireAdminKey() {
    if (!productionMode) return '';
    let key = storedAdminKey();
    if (!key) {
      key = String(window.prompt('MEW LOG 管理キーを入力してください') || '').trim();
      if (key) {
        try { sessionStorage.setItem(ADMIN_KEY_STORAGE, key); } catch {}
      }
    }
    if (!key) throw new Error('管理キーが必要です。');
    return key;
  }

  function authHeaders(method) {
    if (method === 'GET' || method === 'HEAD') return {};
    const key = requireAdminKey();
    return key ? { 'X-Admin-Key': key } : {};
  }

  function isAuthError(message) {
    return ['admin_key_required', 'invalid_admin_key', 'admin_auth_unavailable'].includes(String(message || ''));
  }

  function friendlyError(value) {
    const message = String(value?.message || value || 'unknown error');
    if (message === 'admin_key_required') return '管理キーが必要です。';
    if (message === 'invalid_admin_key') return '管理キーが違います。もう一度入力してください。';
    if (message === 'admin_auth_unavailable') return '管理キー認証に接続できませんでした。';
    if (message === 'r2_write_permission_denied' || /access\s*denied/i.test(message)) {
      return 'R2の書き込み権限がありません。CloudflareのR2 API Tokenを「Object Read & Write」にしてください。';
    }
    if (message === 'unsupported_media_type') return 'JPEG / PNG / WebP / GIF / MP4 / WebM を選んでください。';
    if (message === 'image_too_large') return '画像は8MBまでです。';
    if (message === 'video_too_large') return '動画は20MBまでです。';
    return message;
  }

  async function api(method = 'GET', body) {
    const headers = { ...authHeaders(method) };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(API, {
      method,
      cache: 'no-store',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (isAuthError(data.error)) clearAdminKey();
      const error = new Error(data.error || `http_${response.status}`);
      error.data = data;
      throw error;
    }
    return data;
  }

  async function mediaApi(method = 'GET', action = '', body) {
    const suffix = action ? `?action=${encodeURIComponent(action)}` : '';
    const headers = { ...authHeaders(method) };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${MEDIA_API}${suffix}`, {
      method,
      cache: 'no-store',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (isAuthError(data.error)) clearAdminKey();
      throw new Error(friendlyError(data.error || `media_http_${response.status}`));
    }
    return data;
  }

  async function deleteMedia(key) {
    if (!key) return;
    const headers = { 'Content-Type': 'application/json', ...authHeaders('DELETE') };
    const response = await fetch(MEDIA_API, {
      method: 'DELETE',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ key })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (isAuthError(data.error)) clearAdminKey();
      throw new Error(friendlyError(data.error || `media_delete_${response.status}`));
    }
  }

  async function uploadMedia(file, onProgress) {
    const type = String(file?.type || '').toLowerCase();
    const isImage = IMAGE_TYPES.has(type);
    const isVideo = VIDEO_TYPES.has(type);
    if (!file || (!isImage && !isVideo)) throw new Error('JPEG / PNG / WebP / GIF / MP4 / WebM を選んでください。');
    if (!file.size || (isImage && file.size > MAX_IMAGE_BYTES)) throw new Error('画像は8MBまでです。');
    if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('動画は20MBまでです。');

    onProgress?.('メディアアップロードを準備しています…', '');
    const started = await mediaApi('POST', 'start', {
      fileName: file.name,
      contentType: file.type,
      size: file.size
    });
    const chunkBytes = Number(started.chunkBytes || 2_500_000);
    const parts = Math.ceil(file.size / chunkBytes);

    for (let index = 0; index < parts; index += 1) {
      const part = index + 1;
      const start = index * chunkBytes;
      const end = Math.min(file.size, start + chunkBytes);
      onProgress?.(`R2へ保存中… ${part} / ${parts}`, '');
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Id': started.uploadId,
        'X-Part-Number': String(part),
        'X-Content-Type': file.type,
        'X-File-Size': String(file.size),
        ...authHeaders('PUT')
      };
      const response = await fetch(MEDIA_API, {
        method: 'PUT',
        cache: 'no-store',
        headers,
        body: file.slice(start, end)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        if (isAuthError(data.error)) clearAdminKey();
        throw new Error(friendlyError(data.error || `メディアパート${part}の保存に失敗しました。`));
      }
    }

    onProgress?.('メディアを仕上げています…', '');
    return mediaApi('POST', 'complete', {
      uploadId: started.uploadId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      parts
    });
  }

  async function loadRemote() {
    const data = await api('GET');
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function migrateLocalIfEmpty(remote) {
    if (productionMode || storageMode === 'shared-content-core' || remote.length) return remote;
    const local = localEntries();
    if (!local.length) return remote;
    for (const entry of local) {
      await api('POST', {
        id: entry.id,
        type: entry.type,
        title: entry.title,
        memo: entry.memo,
        cat: entry.cat || '',
        className: entry.className || '',
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        mediaUrl: entry.mediaUrl || '',
        mediaKey: entry.mediaKey || '',
        mediaType: entry.mediaType || '',
        mediaSize: Number(entry.mediaSize || 0),
        mediaName: entry.mediaName || '',
        createdAt: entry.createdAt || ''
      });
    }
    return loadRemote();
  }

  function setStorageLabel(ok, branchId, storage) {
    const production = storage === 'shared-content-core';
    const footer = document.querySelector('.footer');
    if (footer) {
      footer.textContent = ok
        ? `MEW LOG / HARF-WAY — ${production ? 'Production Core' : 'Neon Preview'} · ${branchId || 'branch'}`
        : 'MEW LOG / HARF-WAY — storage unavailable';
    }
    const notice = document.querySelector('.notice');
    if (notice && ok) {
      notice.textContent = production
        ? 'Neon Production Coreへ保存。全種類で画像 / 動画をR2へ添付できます。追加・編集・削除はHARF-WAY管理キーで保護されています。'
        : 'Neon Preview branchへ保存中。全種類で画像 / 動画をR2へ添付できます。Production DBには書き込みません。';
    }
  }

  function applyEnvironment(data) {
    storageMode = String(data?.storage || '');
    productionMode = data?.environment === 'production' || storageMode === 'shared-content-core';
  }

  async function initPublic() {
    let entries;
    try {
      const data = await api('GET');
      applyEnvironment(data);
      entries = Array.isArray(data.entries) ? data.entries : [];
      setStorageLabel(true, data.branchId, data.storage);
    } catch (error) {
      console.warn('[mew-log] storage unavailable', error?.message || error);
      setStorageLabel(false);
      const grid = document.getElementById('grid');
      if (grid) grid.innerHTML = '<div class="empty">現在、記録を読み込めません。</div>';
      return;
    }

    const stats = document.getElementById('stats');
    const grid = document.getElementById('grid');
    if (!stats || !grid) return;
    let currentFilter = 'all';

    function render() {
      const counts = { diary: 0, video: 0, build: 0, cat: 0 };
      entries.forEach((x) => { if (counts[x.type] !== undefined) counts[x.type] += 1; });
      stats.innerHTML = ['diary', 'video', 'build', 'cat']
        .map((k) => `<div class="stat"><b>${counts[k] || 0}</b><small>${k.toUpperCase()}</small></div>`)
        .join('');

      const list = currentFilter === 'all' ? entries : entries.filter((x) => x.type === currentFilter);
      grid.innerHTML = list.length
        ? list.map((x) => `<article class="card ${x.type === 'video' ? 'video' : ''}">
              <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
              <h3>${esc(x.title)}</h3>
              ${mediaMarkup(x, 'entry-media')}
              <p>${esc(x.memo)}</p>
              <div class="tags">${[x.cat, x.className, ...(x.tags || [])].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            </article>`).join('')
        : '<div class="empty">まだこの種類の記録はありません。管理画面から追加できます。</div>';
    }

    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.onclick = () => {
        currentFilter = button.dataset.filter || 'all';
        document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === button));
        render();
      };
    });
    render();
  }

  async function initAdmin() {
    const form = document.getElementById('form');
    const listEl = document.getElementById('list');
    const editIdEl = document.getElementById('editId');
    const typeEl = document.getElementById('type');
    const titleEl = document.getElementById('title');
    const catEl = document.getElementById('cat');
    const classEl = document.getElementById('className');
    const tagsEl = document.getElementById('tags');
    const memoEl = document.getElementById('memo');
    const mediaFileEl = document.getElementById('mediaFile');
    const mediaStatusEl = document.getElementById('mediaStatus');
    const currentMediaEl = document.getElementById('currentMedia');
    const clearInputsEl = document.getElementById('clearInputs');
    if (!form || !listEl) return;

    let entries = [];
    let r2Ready = false;
    try {
      const first = await api('GET');
      applyEnvironment(first);
      entries = await migrateLocalIfEmpty(Array.isArray(first.entries) ? first.entries : []);
      setStorageLabel(true, first.branchId, first.storage);
    } catch (error) {
      console.warn('[mew-log-admin] storage unavailable', error?.message || error);
      setStorageLabel(false);
      const notice = document.querySelector('.notice');
      if (notice) notice.textContent = `Neon接続待ち：${friendlyError(error)}。`;
      return;
    }

    function setMediaStatus(message = '', mode = '') {
      if (!mediaStatusEl) return;
      mediaStatusEl.textContent = message;
      mediaStatusEl.className = `media-status${message ? ' on' : ''}${mode ? ` ${mode}` : ''}`;
    }

    try {
      const status = await mediaApi('GET');
      r2Ready = Boolean(status.configured);
      if (r2Ready) setMediaStatus(productionMode ? 'R2メディアストレージ：接続OK · 保存時に管理キー認証' : 'R2メディアストレージ：接続OK', 'good');
    } catch (error) {
      r2Ready = false;
      setMediaStatus(`R2メディアストレージ：未接続（${friendlyError(error)}）`, 'bad');
    }

    function selectedEntry() {
      return entries.find((x) => x.id === editIdEl.value) || null;
    }

    function updateMediaControls() {
      if (mediaFileEl) mediaFileEl.disabled = !r2Ready;
      const current = selectedEntry();
      const markup = current ? mediaMarkup(current, '') : '';
      if (currentMediaEl) {
        currentMediaEl.classList.toggle('on', Boolean(markup));
        currentMediaEl.innerHTML = markup
          ? `<strong>現在のメディア</strong>${markup}<span class="media-help">新しいファイルを選ばなければ、このメディアをそのまま残します。</span>`
          : '';
      }
    }

    function clearForm() {
      editIdEl.value = '';
      form.reset();
      typeEl.value = 'diary';
      if (mediaFileEl) mediaFileEl.value = '';
      updateMediaControls();
      if (r2Ready) setMediaStatus(productionMode ? 'R2メディアストレージ：接続OK · 保存時に管理キー認証' : 'R2メディアストレージ：接続OK', 'good');
    }

    function render() {
      const sorted = [...entries].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      listEl.innerHTML = sorted.length
        ? sorted.map((x) => `<article class="item">
              <div>
                <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
                <h3>${esc(x.title)}</h3>
                ${mediaMarkup(x, '')}
                <p>${esc(x.memo)}</p>
              </div>
              <div class="btns">
                <button data-remote-edit="${esc(x.id)}">編集</button>
                <button class="del" data-remote-del="${esc(x.id)}">削除</button>
              </div>
            </article>`).join('')
        : '<div class="empty">まだ記録がありません。</div>';

      document.querySelectorAll('[data-remote-edit]').forEach((button) => {
        button.onclick = () => {
          const x = entries.find((v) => v.id === button.dataset.remoteEdit);
          if (!x) return;
          editIdEl.value = x.id;
          typeEl.value = x.type;
          titleEl.value = x.title || '';
          catEl.value = x.cat || '';
          classEl.value = x.className || '';
          tagsEl.value = (x.tags || []).join(', ');
          memoEl.value = x.memo || '';
          if (mediaFileEl) mediaFileEl.value = '';
          updateMediaControls();
          scrollTo({ top: 0, behavior: 'smooth' });
        };
      });

      document.querySelectorAll('[data-remote-del]').forEach((button) => {
        button.onclick = async () => {
          const existing = entries.find((v) => v.id === button.dataset.remoteDel);
          if (!confirm('この記録を削除しますか？')) return;
          button.disabled = true;
          try {
            await api('DELETE', { id: button.dataset.remoteDel });
            if (existing?.mediaKey) {
              try { await deleteMedia(existing.mediaKey); } catch (error) { console.warn('[mew-log] media cleanup failed', error); }
            }
            entries = await loadRemote();
            render();
          } catch (error) {
            alert(`削除できませんでした：${friendlyError(error)}`);
            button.disabled = false;
          }
        };
      });
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      const previous = selectedEntry();
      let uploaded = null;
      let media = previous ? {
        mediaUrl: previous.mediaUrl || '',
        mediaKey: previous.mediaKey || '',
        mediaType: previous.mediaType || '',
        mediaSize: Number(previous.mediaSize || 0),
        mediaName: previous.mediaName || ''
      } : { mediaUrl: '', mediaKey: '', mediaType: '', mediaSize: 0, mediaName: '' };

      try {
        if (productionMode) requireAdminKey();
        const file = mediaFileEl?.files?.[0] || null;
        if (file) {
          if (!r2Ready) throw new Error('R2メディアストレージが未接続です。');
          uploaded = await uploadMedia(file, setMediaStatus);
          media = {
            mediaUrl: uploaded.mediaUrl || '',
            mediaKey: uploaded.mediaKey || '',
            mediaType: uploaded.mediaType || file.type,
            mediaSize: Number(uploaded.mediaSize || file.size),
            mediaName: uploaded.mediaName || file.name
          };
        }

        setMediaStatus('記録をNeonへ保存しています…', '');
        await api(editIdEl.value ? 'PATCH' : 'POST', {
          id: editIdEl.value || undefined,
          type: typeEl.value,
          title: titleEl.value.trim(),
          cat: catEl.value.trim(),
          className: classEl.value.trim(),
          tags: tagsEl.value.split(',').map((s) => s.trim()).filter(Boolean),
          memo: memoEl.value.trim(),
          ...media,
          createdAt: editIdEl.value ? (previous?.createdAt || '') : new Date().toISOString().slice(0, 10)
        });

        if (previous?.mediaKey && previous.mediaKey !== media.mediaKey) {
          try { await deleteMedia(previous.mediaKey); } catch (error) { console.warn('[mew-log] old media cleanup failed', error); }
        }
        entries = await loadRemote();
        const savedMedia = Boolean(media.mediaUrl);
        clearForm();
        render();
        setMediaStatus(savedMedia ? 'メディアと記録を保存しました。' : '記録を保存しました。', 'good');
      } catch (error) {
        if (uploaded?.mediaKey) {
          try { await deleteMedia(uploaded.mediaKey); } catch {}
        }
        const message = friendlyError(error);
        setMediaStatus(`保存できませんでした：${message}`, 'bad');
        alert(`保存できませんでした：${message}`);
      } finally {
        if (submit) submit.disabled = false;
      }
    };

    if (clearInputsEl) clearInputsEl.onclick = clearForm;
    render();
    updateMediaControls();
  }

  if (isAdmin) initAdmin(); else initPublic();
})();
