(() => {
  async function changeStatus(button) {
    const campaign = window.__HW_ADS_ADMIN_CURRENT_CAMPAIGN?.();
    const action = String(button?.dataset?.action || '');
    if (!campaign?.id || !['activate', 'pause'].includes(action)) {
      alert('対象案件を確認できませんでした。再読込してからもう一度お試しください。');
      return;
    }

    const verb = action === 'pause'
      ? '配信を停止'
      : campaign.status === 'paused' ? '配信を再開' : '承認して配信開始';

    if (!confirm(`「${campaign.title || 'この案件'}」を${verb}します。\n\nこの操作はlive配信へ反映されます。よろしいですか？`)) return;

    button.disabled = true;
    const original = button.textContent;
    button.textContent = '更新中…';

    try {
      const res = await fetch('/api/ads-admin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ campaignId: campaign.id, action })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const messages = {
          session_required: '管理者セッションを確認できませんでした。再ログインしてください。',
          admin_required: '管理者権限を確認できませんでした。',
          campaign_not_found: '対象案件が見つかりませんでした。',
          invalid_action: '操作内容を確認できませんでした。'
        };
        throw new Error(messages[data?.error] || data?.message || (typeof data?.error === 'string' ? data.error : '') || `更新に失敗しました (${res.status})`);
      }
      document.querySelector('#reload')?.click();
    } catch (error) {
      console.error('[HARF-WAY ADS] admin status update failed', error);
      alert(error instanceof Error ? error.message : '配信状態を更新できませんでした。');
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('#detail [data-action]') : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    changeStatus(button);
  }, true);
})();
