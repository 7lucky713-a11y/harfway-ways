(() => {
  const API = '/api/mew-log';
  const MEDIA_API = '/api/mew-log-media';
  const LOCAL_KEY = 'mewlog_entries_v1';
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
  const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
  const isAdmin = location.pathname.includes('/mew-log/admin');

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

  function localEntries() {
    try {
      const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  async function api(method = 'GET', body) {
    const response = await fetch(API, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `http_${response.status}`);
      error.data = data;
      throw error;
    }
    return data;
  }

  async function mediaApi(method = 'GET', action = '', body) {
    const suffix = action ? `?action=${encodeURIComponent(action)}` : '';
    const response = await fetch(`${MEDIA_API}${suffix}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `media_http_${response.status}`);
    return data;
  }

  async function deleteMedia(key) {
    if (!key) return;
    const response = await fetch(MEDIA_API, {
      method: 'DELETE',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `media_delete_${response.status}`);
  }

  async function uploadVideo(file, onProgress) {
    if (!file || !VIDEO_TYPES.has(String(file.type || '').toLowerCase())) throw new Error('MP4 または WebM を選んでください。');
    if (!file.size || file.size > MAX_VIDEO_BYTES) throw new Error('動画は20MBまでです。');

    onProgress?.('動画アップロードを準備しています…', '');
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
      onProgress?.(`動画をR2へ保存中… ${part} / ${parts}`, '');
      const response = await fetch(MEDIA_API, {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Id': started.uploadId,
          'X-Part-Number': String(part),
          'X-Content-Type': file.type,
          'X-File-Size': String(file.size)
        },
        body: file.slice(start, end)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `動画パート${part}の保存に失敗しました。`);
    }

    onProgress?.('動画を仕上げています…', '');
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
    if (remote.length) return remote;
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

  function setStorageLabel(ok, branchId) {
    const footer = document.querySelector('.footer');
    if (footer) {
      footer.textContent = ok
        ? `MEW LOG / HARF-WAY — Neon Preview · ${branchId || 'preview branch'}`
        : 'MEW LOG / HARF-WAY — local fallback · Neon未接続';
    }
    const notice = document.querySelector('.notice');
    if (notice && ok) {
      notice.textContent = 'Neon Preview branchへ保存中。動画メモはMP4 / WebM・20MBまでR2へ保存できます。Production DB / Production公開にはまだ反映しません。';
    }
  }

  async function initPublic() {
    let entries;
    try {
      const data = await api('GET');
      entries = Array.isArray(data.entries) ? data.entries : [];
      setStorageLabel(true, data.branchId);
    } catch (error) {
      console.warn('[mew-log] Neon unavailable; keeping local preview', error?.message || error);
      setStorageLabel(false);
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
        ? list.map((x) => {
            const src = x.type === 'video' ? mediaSrc(x.mediaUrl) : '';
            return `<article class="card ${x.type === 'video' ? 'video' : ''}">
              <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
              <h3>${esc(x.title)}</h3>
              ${src ? `<video class="entry-video" controls playsinline preload="metadata" src="${esc(src)}"></video>` : ''}
              <p>${esc(x.memo)}</p>
              <div class="tags">${[x.cat, x.className, ...(x.tags || [])].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            </article>`;
          }).join('')
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
    const mediaFieldEl = document.getElementById('mediaField');
    const mediaStatusEl = document.getElementById('mediaStatus');
    const currentMediaEl = document.getElementById('currentMedia');
    const clearInputsEl = document.getElementById('clearInputs');
    if (!form || !listEl) return;

    let entries;
    let branchId = '';
    let r2Ready = false;
    try {
      const first = await api('GET');
      branchId = first.branchId || '';
      entries = await migrateLocalIfEmpty(Array.isArray(first.entries) ? first.entries : []);
      setStorageLabel(true, branchId);
    } catch (error) {
      console.warn('[mew-log-admin] Neon unavailable; keeping local editor', error?.message || error);
      setStorageLabel(false);
      const notice = document.querySelector('.notice');
      if (notice) notice.textContent = `Neon接続待ち：${error?.message || 'unknown error'}。現在はブラウザ保存のままです。`;
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
      if (r2Ready) setMediaStatus('R2動画ストレージ：接続OK', 'good');
    } catch (error) {
      r2Ready = false;
      setMediaStatus(`R2動画ストレージ：未接続（${error?.message || 'unknown'}）`, 'bad');
    }

    function selectedEntry() {
      return entries.find((x) => x.id === editIdEl.value) || null;
    }

    function updateMediaControls() {
      const isVideo = typeEl.value === 'video';
      if (mediaFieldEl) mediaFieldEl.style.opacity = isVideo ? '1' : '.45';
      if (mediaFileEl) mediaFileEl.disabled = !isVideo || !r2Ready;
      const current = selectedEntry();
      const src = current && isVideo ? mediaSrc(current.mediaUrl) : '';
      if (currentMediaEl) {
        currentMediaEl.classList.toggle('on', Boolean(src));
        currentMediaEl.innerHTML = src
          ? `<strong>現在の動画</strong><video controls playsinline preload="metadata" src="${esc(src)}"></video><span class="media-help">新しいファイルを選ばなければ、この動画をそのまま残します。</span>`
          : '';
      }
    }

    function clearForm() {
      editIdEl.value = '';
      form.reset();
      typeEl.value = 'diary';
      if (mediaFileEl) mediaFileEl.value = '';
      updateMediaControls();
      if (r2Ready) setMediaStatus('R2動画ストレージ：接続OK', 'good');
    }

    function render() {
      const sorted = [...entries].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      listEl.innerHTML = sorted.length
        ? sorted.map((x) => {
            const src = x.type === 'video' ? mediaSrc(x.mediaUrl) : '';
            return `<article class="item">
              <div>
                <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
                <h3>${esc(x.title)}</h3>
                ${src ? `<video controls playsinline preload="metadata" src="${esc(src)}"></video>` : ''}
                <p>${esc(x.memo)}</p>
              </div>
              <div class="btns">
                <button data-remote-edit="${esc(x.id)}">編集</button>
                <button class="del" data-remote-del="${esc(x.id)}">削除</button>
              </div>
            </article>`;
          }).join('')
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
            alert(`削除できませんでした：${error?.message || 'unknown error'}`);
            button.disabled = false;
          }
        };
      });
    }

    typeEl.addEventListener('change', updateMediaControls);

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
        const file = mediaFileEl?.files?.[0] || null;
        if (typeEl.value === 'video' && file) {
          if (!r2Ready) throw new Error('R2動画ストレージが未接続です。');
          uploaded = await uploadVideo(file, setMediaStatus);
          media = {
            mediaUrl: uploaded.mediaUrl || '',
            mediaKey: uploaded.mediaKey || '',
            mediaType: uploaded.mediaType || file.type,
            mediaSize: Number(uploaded.mediaSize || file.size),
            mediaName: uploaded.mediaName || file.name
          };
        } else if (typeEl.value !== 'video') {
          media = { mediaUrl: '', mediaKey: '', mediaType: '', mediaSize: 0, mediaName: '' };
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
        clearForm();
        render();
        setMediaStatus(typeEl.value === 'video' && media.mediaUrl ? '動画と記録を保存しました。' : '記録を保存しました。', 'good');
      } catch (error) {
        if (uploaded?.mediaKey) {
          try { await deleteMedia(uploaded.mediaKey); } catch {}
        }
        setMediaStatus(`保存できませんでした：${error?.message || 'unknown error'}`, 'bad');
        alert(`保存できませんでした：${error?.message || 'unknown error'}`);
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
