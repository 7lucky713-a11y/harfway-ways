(() => {
  const DATA_HOST = 'ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech';
  const DATA_BASE = `https://${DATA_HOST}/neondb/rest/v1`;
  const previousFetch = window.fetch.bind(window);
  const campaigns = [];
  let authorization = '';

  function requestUrl(input) {
    return typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  }

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  }

  function requestHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  function rememberRows(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row?.id) continue;
      const index = campaigns.findIndex(x => x.id === row.id);
      if (index >= 0) campaigns[index] = row;
      else campaigns.push(row);
    }
  }

  window.fetch = async function hwAdsAdminRepairFetch(input, init) {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    let parsed;
    try { parsed = new URL(url, location.href); } catch { parsed = null; }
    if (parsed?.hostname === DATA_HOST) {
      const auth = requestHeaders(input, init).get('authorization') || '';
      if (/^Bearer\s+\S+/i.test(auth)) authorization = auth;
    }
    const response = await previousFetch(input, init);
    if (parsed?.hostname === DATA_HOST && method === 'GET' && /\/ad_campaigns\/?$/.test(parsed.pathname) && response.ok) {
      response.clone().json().then(rememberRows).catch(() => undefined);
    }
    return response;
  };

  const statusMap = { '審査待ち':'pending', '配信中':'active', '停止中':'paused', '完了':'completed', '終了':'ended', '下書き':'draft', '却下':'rejected' };

  function currentCampaign() {
    const detail = document.querySelector('#detail');
    const title = detail?.querySelector('h2')?.textContent?.trim() || '';
    const statusText = detail?.querySelector('.status')?.textContent?.trim() || '';
    if (!title) return null;
    const matches = campaigns.filter(c => String(c.title || '').trim() === title && (!statusMap[statusText] || c.status === statusMap[statusText]));
    return matches.length === 1 ? matches[0] : null;
  }

  function hasNoMedia() {
    const media = document.querySelector('#detail .media');
    return Boolean(media && /NO MEDIA/i.test(media.textContent || ''));
  }

  async function legacyMedia(campaignId) {
    const url = `${DATA_BASE}/ad_media?campaign_id=eq.${encodeURIComponent(campaignId)}&select=campaign_id,mime_type,file_name,size_bytes,data_base64&limit=20`;
    const res = await previousFetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, cache: 'no-store' });
    const rows = await res.json().catch(() => []);
    if (!res.ok) throw new Error(rows?.message || rows?.hint || `旧メディアを取得できませんでした (${res.status})`);
    return (Array.isArray(rows) ? rows : []).find(row => row?.data_base64 && /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/i.test(String(row.mime_type || ''))) || null;
  }

  async function repair(button) {
    const campaign = currentCampaign();
    if (!campaign) return alert('対象案件を一意に特定できませんでした。再読込してからもう一度お試しください。');
    if (!authorization) return alert('管理者ログイン情報を確認できません。再読込してください。');
    button.disabled = true;
    button.textContent = '旧メディアを確認中…';
    try {
      const row = await legacyMedia(campaign.id);
      if (!row) throw new Error('この案件には復旧できる旧メディアが見つかりませんでした。');
      button.textContent = 'R2へ復旧中…';
      const res = await window.fetch(`${DATA_BASE}/ad_media`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `復旧に失敗しました (${res.status})`);
      }
      button.textContent = '復旧しました';
      setTimeout(() => document.querySelector('#reload')?.click(), 900);
    } catch (error) {
      console.error('[HARF-WAY ADS] legacy media repair failed', error);
      alert(error instanceof Error ? error.message : 'メディアを復旧できませんでした。');
      button.disabled = false;
      button.textContent = '旧メディアをR2へ復旧';
    }
  }

  function mount() {
    const actions = document.querySelector('#detail .actions');
    if (!actions || !hasNoMedia() || document.querySelector('#hw-ads-media-repair')) return;
    const campaign = currentCampaign();
    const button = document.createElement('button');
    button.id = 'hw-ads-media-repair';
    button.className = 'action';
    button.type = 'button';
    button.textContent = campaign ? '旧メディアをR2へ復旧' : '旧メディアを確認';
    button.addEventListener('click', () => repair(button));
    actions.prepend(button);
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:8px;font-size:10px;line-height:1.6;color:#817767';
    note.textContent = '旧方式で保存された画像・動画がある場合、R2へ移して管理画面と公開広告へ反映します。';
    actions.insertAdjacentElement('afterend', note);
  }

  const observer = new MutationObserver(() => queueMicrotask(mount));
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('load', mount);
})();
