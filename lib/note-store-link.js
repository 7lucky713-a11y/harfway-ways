import { classifyGameLink } from '../api/game-link-utils.js';

export function normalizeNoteStoreUrl(value = '') {
  const input = String(value ?? '').trim();
  if (!input) return '';
  if (input.length > 2048) throw Object.assign(new Error('store_url_too_long'), { status: 400 });
  let url;
  try { url = new URL(input); } catch { /* handled below */ }
  if (!url || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw Object.assign(new Error('store_url_must_be_https'), { status: 400 });
  }
  return url.href;
}

export function safeNoteStoreUrl(value = '') {
  try { return normalizeNoteStoreUrl(value); } catch { return ''; }
}

export function noteStoreLabel(value = '') {
  const url = safeNoteStoreUrl(value);
  if (!url) return '';
  const known = classifyGameLink(url);
  return known?.service && known.service !== 'web'
    ? known.label
    : new URL(url).hostname.replace(/^www\./, '');
}
