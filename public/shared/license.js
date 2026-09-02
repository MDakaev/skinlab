/**
 * Разовая лицензия SkinLab: клиентский entitlement в localStorage.
 * Проверка на клиенте — UX-gate, не криптографическая защита.
 */

const STORAGE_KEY = 'skinlab.license.v1';

/** Цена по умолчанию, если API недоступен. */
export const LICENSE_PRICE = {
  amount: 1290,
  currency: 'RUB',
  label: '1 290 ₽',
  title: 'SkinLab — полная лицензия',
};

export const OFFER_PATH = '../legal/offer.html';
export const PRIVACY_PATH = '../legal/privacy.html';

function apiBase() {
  try {
    const override = localStorage.getItem('skinlab.api');
    if (override) return override.replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  const host = location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') return 'http://127.0.0.1:8787';
  return '';
}

export function loadLicense() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}

export function isLicensed() {
  return Boolean(loadLicense());
}

export function saveLicense(payload) {
  const data = {
    ok: true,
    code: payload.code || null,
    unlockedAt: payload.unlockedAt || new Date().toISOString(),
    source: payload.source || 'redeem',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

export function clearLicense() {
  localStorage.removeItem(STORAGE_KEY);
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

/**
 * @returns {Promise<{ ok: boolean, mode?: string, price?: object, payments?: boolean, error?: string }>}
 */
export async function fetchLicenseOffer() {
  const base = apiBase();
  if (!base) {
    return {
      ok: true,
      mode: 'offline',
      payments: false,
      price: LICENSE_PRICE,
      error: null,
    };
  }
  try {
    const res = await fetch(`${base}/api/license/offer`, { credentials: 'omit' });
    if (!res.ok) throw new Error('offer_http');
    const body = await res.json();
    return {
      ok: true,
      mode: body.mode || 'live',
      payments: Boolean(body.payments),
      price: body.price || LICENSE_PRICE,
      error: null,
    };
  } catch {
    return {
      ok: false,
      mode: 'offline',
      payments: false,
      price: LICENSE_PRICE,
      error: 'api_unreachable',
    };
  }
}

/**
 * Создать платёж / dev-лицензию.
 * @returns {Promise<{ ok: boolean, code?: string, confirmationUrl?: string, mode?: string, error?: string }>}
 */
const PENDING_PAYMENT_KEY = 'skinlab.pendingPayment';

export async function startCheckout() {
  const base = apiBase();
  if (!base) return { ok: false, error: 'api_unreachable' };
  try {
    const res = await fetch(`${base}/api/license/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnUrl: `${location.origin}${location.pathname}?tab=me&license=return`,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'checkout_failed' };
    if (body.paymentId) {
      try {
        sessionStorage.setItem(PENDING_PAYMENT_KEY, body.paymentId);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: true,
      mode: body.mode,
      code: body.code || null,
      paymentId: body.paymentId || null,
      confirmationUrl: body.confirmationUrl || null,
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** После возврата из ЮKassa — забрать код по paymentId. */
export async function claimPendingPayment() {
  const base = apiBase();
  let paymentId = null;
  try {
    paymentId = sessionStorage.getItem(PENDING_PAYMENT_KEY);
  } catch {
    /* ignore */
  }
  if (!base || !paymentId) return { ok: false, error: 'no_pending' };

  try {
    const res = await fetch(`${base}/api/license/payment/${encodeURIComponent(paymentId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'sync_failed' };
    if (!body.code) return { ok: false, error: 'payment_pending', status: body.status };
    const redeemed = await redeemLicense(body.code);
    if (redeemed.ok) {
      try {
        sessionStorage.removeItem(PENDING_PAYMENT_KEY);
      } catch {
        /* ignore */
      }
    }
    return redeemed.ok ? { ok: true, code: body.code, license: redeemed.license } : redeemed;
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Активировать код на устройстве.
 * Без API — только если код уже известен как выданный (не используется);
 * с API — серверная проверка.
 */
export async function redeemLicense(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code || code.length < 8) return { ok: false, error: 'invalid_code' };

  const base = apiBase();
  if (!base) {
    // Офлайн: принимаем только уже сохранённый тот же код нельзя выдать —
    // без сервера redeem новых кодов недоступен.
    return { ok: false, error: 'api_unreachable' };
  }

  try {
    const res = await fetch(`${base}/api/license/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'redeem_failed' };
    const saved = saveLicense({ code: body.code || code, source: 'redeem' });
    return { ok: true, license: saved };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Подпись ошибок для тоста. */
export function licenseErrorText(code) {
  switch (code) {
    case 'invalid_code':
      return 'Проверьте код — похоже, он неполный';
    case 'not_found':
      return 'Такого кода нет';
    case 'already_redeemed':
      return 'Код уже использован на другом устройстве';
    case 'payment_pending':
      return 'Оплата ещё не подтверждена. Подождите минуту и попробуйте снова';
    case 'revoked':
      return 'Этот код отозван';
    case 'api_unreachable':
      return 'Сервер лицензий недоступен. Попробуйте позже или введите код, когда API снова будет онлайн';
    case 'payments_disabled':
      return 'Оплата пока не подключена. Можно активировать код, если он уже есть';
    case 'checkout_failed':
      return 'Не удалось создать платёж';
    case 'network':
      return 'Нет сети. Проверьте соединение';
    case 'no_pending':
      return 'Нет ожидающего платежа';
    default:
      return 'Не получилось. Попробуйте ещё раз';
  }
}

/**
 * HTML paywall-карточки (в экраны Ideal / Plan).
 * @param {{ title?: string, text?: string }} [opts]
 */
export function paywallCard(opts = {}) {
  const title = opts.title || 'Полный уход — по разовой лицензии';
  const text =
    opts.text ||
    'Справочник сочетаний остаётся бесплатным. Персональный идеальный уход и недельный план открываются одной покупкой — без подписки.';
  const price = LICENSE_PRICE.label;
  return `
    <section class="paywall" data-paywall>
      <div class="paywall__badge">Разовая лицензия</div>
      <h2>${title}</h2>
      <p>${text}</p>
      <p class="paywall__price">${price}</p>
      <p class="paywall__fine">
        Разовая оплата. Мы не обещаем, что сайт будет доступен вечно — это лицензия на использование приложения, а не подписка на сервис.
        <a href="${OFFER_PATH}" target="_blank" rel="noopener">Оферта</a>
      </p>
      <button type="button" class="btn-primary" data-open-license>Открыть покупку</button>
      <button type="button" class="btn-second" data-open-license-redeem>У меня уже есть код</button>
    </section>`;
}
