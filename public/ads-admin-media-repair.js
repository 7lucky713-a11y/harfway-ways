(() => {
  const DATA_HOST = 'ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech';
  const previousFetch = window.fetch.bind(window);
  const campaigns = [];

  function requestUrl(input) {
    return typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  }

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
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

  async function repair(button) {
    const campaign = currentCampaign();
    if (!campaign) return alert('対象案件を一意に特定できませんでした。再読込してからもう一度お試しください。');

    button.disabled = true;
    button.textContent = '旧メディアを確認中…';
    try {
      const res = await previousFetch('/api/ads-admin-media-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ campaignId: campaign.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const messages = {
          session_required: '管理者セッションを確認できませんでした。再ログインしてください。',
          admin_required: '管理者権限を確認できませんでした。',
          campaign_not_found: '対象案件が見つかりませんでした。',
          legacy_media_not_found: 'この案件には復旧できる旧メディアが見つかりませんでした。'
        };
        throw new Error(messages[data?.error] || data?.error || `復旧に失敗しました (${res.status})`);
      }

      button.textContent = data.alreadyRepaired ? 'すでに復旧済みです' : 'R2へ復旧しました';
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
    note.textContent = '旧方式で保存された画像・動画がある場合、サーバー側でR2へ移して管理画面と公開広告へ反映します。旧データは確認用に残します。';
    actions.insertAdjacentElement('afterend', note);
  }

  const observer = new MutationObserver(() => queueMicrotask(mount));
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('load', mount);
})();
