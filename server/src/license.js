/**
 * Разовые лицензии SkinLab + опциональная ЮKassa.
 *
 * Режимы:
 * - live: YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY заданы → реальные платежи
 * - dev: SKINLAB_DEV_LICENSES=1 → checkout сразу выдаёт код без оплаты
 * - disabled: оплата выключена, redeem кодов всё ещё работает
 */
import { randomBytes, createHash } from 'node:crypto';
import { getDb } from './db.js';

const LICENSE_SCHEMA = `
CREATE TABLE IF NOT EXISTS licenses (
  code           TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'issued',
  payment_id     TEXT,
  amount_kopecks INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'RUB',
  created_at     TEXT NOT NULL,
  redeemed_at    TEXT,
  meta           TEXT
);

CREATE INDEX IF NOT EXISTS licenses_payment_idx ON licenses(payment_id);
CREATE INDEX IF NOT EXISTS licenses_status_idx ON licenses(status);
`;

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  getDb().exec(LICENSE_SCHEMA);
  schemaReady = true;
}

export const DEFAULT_PRICE = {
  amount: 1290,
  currency: 'RUB',
  label: '1 290 ₽',
  title: 'SkinLab — полная лицензия',
};

function priceFromEnv() {
  const amount = Number.parseInt(process.env.SKINLAB_LICENSE_PRICE_RUB || '1290', 10);
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 1290;
  return {
    amount: safe,
    currency: 'RUB',
    label: `${safe.toLocaleString('ru-RU')} ₽`,
    title: DEFAULT_PRICE.title,
  };
}

export function paymentsConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

export function devLicensesEnabled() {
  return process.env.SKINLAB_DEV_LICENSES === '1' || process.env.SKINLAB_DEV_LICENSES === 'true';
}

export function licenseMode() {
  if (paymentsConfigured()) return 'live';
  if (devLicensesEnabled()) return 'dev';
  return 'disabled';
}

export function getOffer() {
  const mode = licenseMode();
  return {
    mode,
    payments: mode === 'live',
    price: priceFromEnv(),
  };
}

function chunkCode(raw) {
  return raw.match(/.{1,4}/g).join('-');
}

/** Код вида SL-XXXX-XXXX-XXXX */
export function generateLicenseCode() {
  const body = randomBytes(6).toString('hex').toUpperCase();
  return `SL-${chunkCode(body)}`;
}

export function normalizeLicenseCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

export function issueLicense({ paymentId = null, amountKopecks = null, meta = null } = {}) {
  ensureSchema();
  const db = getDb();
  const price = priceFromEnv();
  const amount = amountKopecks ?? price.amount * 100;
  const created_at = new Date().toISOString();

  for (let i = 0; i < 8; i += 1) {
    const code = generateLicenseCode();
    try {
      db.prepare(
        `INSERT INTO licenses (code, status, payment_id, amount_kopecks, currency, created_at, meta)
         VALUES (@code, 'issued', @payment_id, @amount_kopecks, @currency, @created_at, @meta)`
      ).run({
        code,
        payment_id: paymentId,
        amount_kopecks: amount,
        currency: price.currency,
        created_at,
        meta: meta ? JSON.stringify(meta) : null,
      });
      return { code, created_at, amount_kopecks: amount, currency: price.currency };
    } catch (err) {
      if (String(err.message || '').includes('UNIQUE')) continue;
      throw err;
    }
  }
  throw new Error('license_issue_failed');
}

export function findLicenseByPayment(paymentId) {
  ensureSchema();
  if (!paymentId) return null;
  return getDb().prepare(`SELECT * FROM licenses WHERE payment_id = ?`).get(paymentId) || null;
}

export function getLicense(code) {
  ensureSchema();
  const normalized = normalizeLicenseCode(code);
  if (!normalized) return null;
  return getDb().prepare(`SELECT * FROM licenses WHERE code = ?`).get(normalized) || null;
}

/**
 * Redeem: первый redeem привязывает код к «устройству» логически (status=redeemed).
 * Повторный redeem того же кода разрешён (восстановление на том же/другом устройстве
 * с тем же кодом) — иначе смена браузера ломает покупку. Уже redeemed → ok.
 */
export function redeemLicense(code) {
  ensureSchema();
  const row = getLicense(code);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'revoked') return { ok: false, error: 'revoked' };
  if (row.status === 'pending') return { ok: false, error: 'payment_pending' };

  const redeemed_at = row.redeemed_at || new Date().toISOString();
  if (!row.redeemed_at) {
    getDb()
      .prepare(`UPDATE licenses SET status = 'redeemed', redeemed_at = ? WHERE code = ?`)
      .run(redeemed_at, row.code);
  }

  return { ok: true, code: row.code, redeemed_at };
}

function yookassaAuthHeader() {
  const id = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

/**
 * Создать платёж ЮKassa. Возвращает confirmation_url.
 */
export async function createYooPayment({ returnUrl, description }) {
  const price = priceFromEnv();
  const idempotenceKey = createHash('sha256')
    .update(`${Date.now()}-${randomBytes(8).toString('hex')}`)
    .digest('hex');

  const payload = {
    amount: {
      value: price.amount.toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl,
    },
    description: description || price.title,
    metadata: {
      product: 'skinlab_license',
    },
  };

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: yookassaAuthHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.description || body.code || 'yookassa_error');
    err.status = res.status;
    err.body = body;
    throw err;
  }

  // Резервируем строку лицензии до webhook (код ещё не отдаём клиенту до succeeded).
  const pendingCode = generateLicenseCode();
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO licenses (code, status, payment_id, amount_kopecks, currency, created_at, meta)
       VALUES (?, 'pending', ?, ?, 'RUB', ?, ?)`
    )
    .run(
      pendingCode,
      body.id,
      Math.round(Number.parseFloat(body.amount?.value || price.amount) * 100),
      new Date().toISOString(),
      JSON.stringify({ yookassa: true })
    );

  return {
    paymentId: body.id,
    confirmationUrl: body.confirmation?.confirmation_url || null,
    status: body.status,
    pendingCode,
  };
}

/** Webhook: payment.succeeded → status issued (код готов к redeem). */
export function handleYooWebhook(event) {
  ensureSchema();
  const obj = event?.object;
  if (!obj || event.event !== 'payment.succeeded') {
    return { ok: true, ignored: true };
  }

  const paymentId = obj.id;
  const row = findLicenseByPayment(paymentId);
  if (!row) {
    // Платёж без pending-строки — выдаём новый код.
    const issued = issueLicense({
      paymentId,
      amountKopecks: Math.round(Number.parseFloat(obj.amount?.value || '0') * 100),
      meta: { via: 'webhook_orphan' },
    });
    return { ok: true, code: issued.code, created: true };
  }

  if (row.status === 'pending') {
    getDb()
      .prepare(`UPDATE licenses SET status = 'issued' WHERE code = ?`)
      .run(row.code);
  }

  return { ok: true, code: row.code, created: false };
}

/** После return из ЮKassa: найти код по payment_id или выдать, если webhook ещё не пришёл. */
export function finalizePayment(paymentId) {
  ensureSchema();
  const row = findLicenseByPayment(paymentId);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'pending') {
    getDb()
      .prepare(`UPDATE licenses SET status = 'issued' WHERE code = ?`)
      .run(row.code);
  }
  return { ok: true, code: row.code, status: row.status === 'pending' ? 'issued' : row.status };
}

/**
 * Checkout: live → ЮKassa; dev → сразу код; disabled → ошибка.
 */
export async function checkout({ returnUrl }) {
  const mode = licenseMode();
  if (mode === 'disabled') return { ok: false, error: 'payments_disabled' };

  if (mode === 'dev') {
    const issued = issueLicense({ meta: { via: 'dev' } });
    return { ok: true, mode: 'dev', code: issued.code, confirmationUrl: null };
  }

  try {
    const payment = await createYooPayment({ returnUrl });
    return {
      ok: true,
      mode: 'live',
      paymentId: payment.paymentId,
      confirmationUrl: payment.confirmationUrl,
      // Код не отдаём до succeeded — клиент получит через return+poll или webhook email later.
      code: null,
    };
  } catch (err) {
    return { ok: false, error: 'checkout_failed', detail: err.message };
  }
}

/** Для live: получить статус платежа в ЮKassa и выдать код. */
export async function syncPayment(paymentId) {
  if (!paymentsConfigured() || !paymentId) return { ok: false, error: 'payments_disabled' };

  const res = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: yookassaAuthHeader() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: 'yookassa_error' };

  if (body.status === 'succeeded') {
    const finalized = finalizePayment(paymentId);
    if (finalized.ok) return finalized;
    const issued = issueLicense({
      paymentId,
      amountKopecks: Math.round(Number.parseFloat(body.amount?.value || '0') * 100),
      meta: { via: 'sync' },
    });
    return { ok: true, code: issued.code, status: 'issued' };
  }

  return { ok: true, status: body.status, code: null };
}
