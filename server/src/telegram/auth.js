/**
 * Валидация Telegram WebApp initData на сервере.
 * Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * initDataUnsafe на клиенте НЕ является доказательством личности.
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const MAX_AUTH_AGE_SEC = 60 * 60 * 24; // 24 часа

export function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

export function telegramConfigured() {
  return Boolean(getBotToken());
}

/**
 * @param {string} initData — raw query string from Telegram.WebApp.initData
 * @param {{ botToken?: string, maxAgeSec?: number }} [opts]
 * @returns {{ ok: true, user: object|null, authDate: number, payload: Record<string,string> } | { ok: false, error: string }}
 */
export function validateInitData(initData, opts = {}) {
  const botToken = opts.botToken || getBotToken();
  if (!botToken) return { ok: false, error: 'bot_token_missing' };

  const raw = String(initData || '').trim();
  if (!raw) return { ok: false, error: 'init_data_missing' };

  let params;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { ok: false, error: 'init_data_invalid' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'hash_missing' };

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  let hashOk = false;
  try {
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    hashOk = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    hashOk = false;
  }
  if (!hashOk) return { ok: false, error: 'hash_mismatch' };

  const authDate = Number.parseInt(params.get('auth_date') || '', 10);
  if (!Number.isFinite(authDate)) return { ok: false, error: 'auth_date_invalid' };

  const maxAge = opts.maxAgeSec ?? MAX_AUTH_AGE_SEC;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAge) return { ok: false, error: 'auth_date_expired' };

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw);
      if (parsed && typeof parsed === 'object' && parsed.id != null) {
        user = {
          id: parsed.id,
          firstName: parsed.first_name || '',
          lastName: parsed.last_name || '',
          username: parsed.username || '',
          languageCode: parsed.language_code || '',
          isPremium: Boolean(parsed.is_premium),
        };
      }
    } catch {
      return { ok: false, error: 'user_invalid' };
    }
  }

  const payload = Object.fromEntries(params.entries());
  delete payload.hash;

  return { ok: true, user, authDate, payload };
}

/** Не логировать полный initData / token. */
export function redactInitData(initData) {
  const s = String(initData || '');
  if (!s) return '';
  return `len=${s.length};has_hash=${s.includes('hash=')}`;
}

export function webhookSecretHint() {
  const token = getBotToken();
  if (!token) return null;
  return createHash('sha256').update(`skinlab-tg:${token}`).digest('hex').slice(0, 16);
}
