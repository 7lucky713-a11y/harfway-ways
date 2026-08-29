(() => {
  const API = '/api/mew-log';
  const LOCAL_KEY = 'mewlog_entries_v1';
  const isAdmin = location.pathname.includes('/mew-log/admin');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
      notice.textContent = 'Neon Preview branchへ保存中。追加・編集・削除は再読み込み後も残り、同じPreviewを開けば別端末でも共有されます。Production DBには書き込みません。';
    }
  }

  async function initPublic() {
    let entries;
    let meta;
    try {
      const data = await api('GET');
      entries = Array.isArray(data.entries) ? data.entries : [];
      meta = data;
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
        ? list.map((x) => `<article class="card ${x.type === 'video' ? 'video' : ''}">
            <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
            <h3>${esc(x.title)}</h3>
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
    const resetEl = document.getElementById('reset');
    if (!form || !listEl) return;

    let entries;
    let branchId = '';
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

    function clearForm() {
      editIdEl.value = '';
      form.reset();
      typeEl.value = 'diary';
    }

    function render() {
      const sorted = [...entries].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      listEl.innerHTML = sorted.length
        ? sorted.map((x) => `<article class="item">
            <div>
              <small>${esc(String(x.type || '').toUpperCase())} / ${esc(x.createdAt)}</small>
              <h3>${esc(x.title)}</h3>
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
          scrollTo({ top: 0, behavior: 'smooth' });
        };
      });

      document.querySelectorAll('[data-remote-del]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm('この記録を削除しますか？')) return;
          button.disabled = true;
          try {
            await api('DELETE', { id: button.dataset.remoteDel });
            entries = await loadRemote();
            render();
          } catch (error) {
            alert(`削除できませんでした：${error?.message || 'unknown error'}`);
            button.disabled = false;
          }
        };
      });
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await api(editIdEl.value ? 'PATCH' : 'POST', {
          id: editIdEl.value || undefined,
          type: typeEl.value,
          title: titleEl.value.trim(),
          cat: catEl.value.trim(),
          className: classEl.value.trim(),
          tags: tagsEl.value.split(',').map((s) => s.trim()).filter(Boolean),
          memo: memoEl.value.trim(),
          createdAt: editIdEl.value ? (entries.find((x) => x.id === editIdEl.value)?.createdAt || '') : new Date().toISOString().slice(0, 10)
        });
        entries = await loadRemote();
        clearForm();
        render();
      } catch (error) {
        alert(`保存できませんでした：${error?.message || 'unknown error'}`);
      } finally {
        if (submit) submit.disabled = false;
      }
    };

    if (resetEl) resetEl.onclick = clearForm;
    render();
  }

  if (isAdmin) initAdmin(); else initPublic();
})();
