/**
 * SkinLab access gate for Cloudflare Workers.
 * Same exports as the old one-time license module, but backed by:
 *   POST /api/auth  → trial / subscription / owner
 *   GET  /api/plans
 *   POST /api/checkout → Platega
 *
 * Client-side isLicensed() is UX only — server already granted trial/paid_until.
 */

const SUB_CACHE_KEY = 'skinlab.subscription.v1';

/** Fallback label if plans API is offline. */
export const LICENSE_PRICE = {
  amount: 290,
  currency: 'RUB',
  label: 'от 290 ₽ / мес',
  title: 'SkinLab — подписка',
};

export const OFFER_PATH = '/legal/offer.html';
export const PRIVACY_PATH = '/legal/privacy.html';

/** @type {null | { active: boolean, planId?: string|null, paidUntil?: string|null, isTrial?: boolean, isOwner?: boolean, trialJustGranted?: boolean, user?: object }} */
let cached = null;

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  try {
    const override = localStorage.getItem('skinlab.api');
    if (override) return `${override.replace(/\/$/, '')}${p}`;
  } catch {
    /* ignore */
  }
  return p;
}

function initData() {
  return window.Telegram?.WebApp?.initData || '';
}

function readLocalCache() {
  try {
    const raw = sessionStorage.getItem(SUB_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalCache(sub) {
  try {
    sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify(sub));
  } catch {
    /* ignore */
  }
}

/** Snapshot used by profile UI (ok flag mirrors old license shape). */
export function loadLicense() {
  const sub = cached || readLocalCache();
  if (!sub?.active) return null;
  return {
    ok: true,
    code: sub.planId || null,
    unlockedAt: sub.paidUntil || null,
    source: sub.isOwner ? 'owner' : sub.isTrial ? 'trial' : 'subscription',
    planId: sub.planId,
    paidUntil: sub.paidUntil,
    isTrial: Boolean(sub.isTrial),
    isOwner: Boolean(sub.isOwner),
  };
}

export function isLicensed() {
  if (cached) return Boolean(cached.active);
  const local = readLocalCache();
  return Boolean(local?.active);
}

export function saveLicense() {
  /* no-op: entitlement lives on server (D1) */
  return loadLicense();
}

export function clearLicense() {
  cached = { active: false };
  try {
    sessionStorage.removeItem(SUB_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Call once on boot (and after payment return).
 * Grants trial on first auth via Worker.
 */
export async function refreshSubscription() {
  const data = initData();
  if (!data) {
    cached = { active: false, reason: 'no_telegram' };
    writeLocalCache(cached);
    return cached;
  }
  try {
    const res = await fetch(apiUrl('/api/auth'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: data }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      cached = { active: false, error: body.error || 'auth_failed' };
      writeLocalCache(cached);
      return cached;
    }
    cached = {
      active: Boolean(body.subscription?.active),
      planId: body.subscription?.planId ?? null,
      paidUntil: body.subscription?.paidUntil ?? null,
      isTrial: Boolean(body.subscription?.isTrial),
      isOwner: Boolean(body.subscription?.isOwner),
      trialJustGranted: Boolean(body.subscription?.trialJustGranted),
      trialDays: body.subscription?.trialDays ?? 3,
      user: body.user || null,
      profile: body.profile ?? null,
    };
    writeLocalCache(cached);
    return cached;
  } catch {
    cached = readLocalCache() || { active: false, error: 'network' };
    return cached;
  }
}

/** @returns {Promise<{ ok: boolean, mode?: string, payments?: boolean, price?: object, plans?: array, error?: string }>} */
export async function fetchLicenseOffer() {
  try {
    const res = await fetch(apiUrl('/api/plans'));
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw new Error('plans');
    const plans = body.plans || [];
    const cheapest = plans[0];
    return {
      ok: true,
      mode: 'subscription',
      payments: true,
      plans,
      price: {
        amount: cheapest?.priceRub ?? LICENSE_PRICE.amount,
        currency: 'RUB',
        label: cheapest ? `от ${cheapest.priceRub} ₽` : LICENSE_PRICE.label,
        title: 'Подписка SkinLab',
      },
      error: null,
    };
  } catch {
    return {
      ok: false,
      mode: 'offline',
      payments: false,
      plans: [],
      price: LICENSE_PRICE,
      error: 'api_unreachable',
    };
  }
}

/**
 * Start Platega checkout for a plan id (m1/m3/m6/m12).
 * @param {string} [planId]
 */
export async function startCheckout(planId = 'm1') {
  const data = initData();
  if (!data) return { ok: false, error: 'invalid_init_data' };
  try {
    const res = await fetch(apiUrl('/api/checkout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: data, planId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      return { ok: false, error: body.error || 'checkout_failed' };
    }
    return {
      ok: true,
      mode: 'platega',
      paymentId: body.paymentId || null,
      confirmationUrl: body.url || null,
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** After return from Platega (?paid=1) — re-fetch subscription. */
export async function claimPendingPayment() {
  const sub = await refreshSubscription();
  if (sub.active && !sub.isTrial) return { ok: true, license: loadLicense() };
  if (sub.active) return { ok: true, license: loadLicense(), pending: false };
  return { ok: false, error: 'payment_pending' };
}

/** Codes are not used with subscriptions — keep stub for old UI paths. */
export async function redeemLicense() {
  return { ok: false, error: 'codes_disabled' };
}

export function licenseErrorText(code) {
  switch (code) {
    case 'invalid_init_data':
      return 'Открой SkinLab из Telegram-бота';
    case 'payments_not_configured':
      return 'Оплата ещё не подключена. Пробный период всё равно работает.';
    case 'checkout_failed':
      return 'Не удалось создать платёж';
    case 'payment_pending':
      return 'Если оплата прошла, подожди минуту и обнови экран';
    case 'codes_disabled':
      return 'Коды больше не используются — доступ по подписке и пробному периоду';
    case 'api_unreachable':
      return 'Сервер недоступен. Попробуй позже';
    case 'network':
      return 'Нет сети. Проверь соединение';
    case 'unknown_plan':
      return 'Неизвестный тариф';
    default:
      return 'Не получилось. Попробуй ещё раз';
  }
}

/**
 * HTML paywall card for Ideal / Plan tabs.
 * @param {{ title?: string, text?: string }} [opts]
 */
export function paywallCard(opts = {}) {
  const title = opts.title || 'Полный уход — по подписке';
  const text =
    opts.text ||
    'Справочник сочетаний бесплатный. Идеальная рутина и недельный план — в пробном периоде или по подписке.';
  const price = LICENSE_PRICE.label;
  return `
    <section class="paywall" data-paywall>
      <div class="paywall__badge">Подписка</div>
      <h2>${title}</h2>
      <p>${text}</p>
      <p class="paywall__price">${price}</p>
      <p class="paywall__fine">
        Новым — 3 дня бесплатно. Дальше — оплата выбранного срока один раз, без автосписаний.
        <a href="${OFFER_PATH}" target="_blank" rel="noopener">Соглашение</a>
      </p>
      <button type="button" class="btn-primary" data-open-license>Открыть подписку</button>
    </section>`;
}

export function getCachedSubscription() {
  return cached || readLocalCache();
}
