/**
 * Share result: Telegram → Web Share API → clipboard.
 * Не вставляет данные через innerHTML — только text.
 */

import { getTelegramWebApp, isTelegramApp } from './telegram.js';

function formatShareText(data = {}) {
  if (typeof data === 'string') return data;
  if (data.text) return String(data.text);

  const names = Array.isArray(data.actives)
    ? data.actives.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
    : [];
  const verdict = data.verdict || data.levelLabel || '';
  const tone = data.ok === false || data.level === 'avoid' ? '🔴' : data.level === 'caution' ? '🟡' : '🟢';

  const lines = ['Проверка:'];
  if (names.length) lines.push(names.join('\n+\n'));
  if (verdict) lines.push(`${tone} ${verdict}`);
  else if (data.summary) lines.push(String(data.summary));
  if (data.url) lines.push(String(data.url));
  return lines.filter(Boolean).join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

/**
 * @param {object|string} data
 * @returns {Promise<{ ok: boolean, via: 'telegram'|'web-share'|'clipboard'|'none', error?: string }>}
 */
export async function shareResult(data) {
  const text = formatShareText(data);
  const url = typeof data === 'object' && data?.url ? String(data.url) : '';

  if (isTelegramApp()) {
    const wa = getTelegramWebApp();
    try {
      if (typeof wa.openTelegramLink === 'function' && text) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url || location.href)}&text=${encodeURIComponent(text)}`;
        wa.openTelegramLink(shareUrl);
        return { ok: true, via: 'telegram' };
      }
    } catch {
      /* fall through */
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ text, ...(url ? { url } : {}) });
      return { ok: true, via: 'web-share' };
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, via: 'web-share', error: 'aborted' };
    }
  }

  try {
    const ok = await copyText(url ? `${text}\n${url}` : text);
    return ok ? { ok: true, via: 'clipboard' } : { ok: false, via: 'none', error: 'unavailable' };
  } catch {
    return { ok: false, via: 'none', error: 'unavailable' };
  }
}
