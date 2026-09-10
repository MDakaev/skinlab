/**
 * Platega payment provider.
 * Docs: create transaction + callback with X-MerchantId / X-Secret headers.
 * Status CONFIRMED = money received.
 */

import type { Env } from '../env';
import type { Plan } from '../lib/plans';

const PLATEGA_BASE = 'https://app.platega.io';

export type PlategaCreateResult = {
  transactionId: string;
  status: string;
  url: string;
};

function authHeaders(env: Env): HeadersInit {
  return {
    'content-type': 'application/json',
    'X-MerchantId': env.PLATEGA_MERCHANT_ID,
    'X-Secret': env.PLATEGA_SECRET,
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Callback authenticity: Platega echoes merchant credentials (no body signature). */
export function verifyPlategaCallback(env: Env, headers: Headers): boolean {
  // Empty env secrets must fail closed — otherwise timingSafeEqual('', '') accepts anyone.
  if (!env.PLATEGA_MERCHANT_ID || !env.PLATEGA_SECRET) return false;
  const mid = headers.get('X-MerchantId') || headers.get('x-merchantid') || '';
  const secret = headers.get('X-Secret') || headers.get('x-secret') || '';
  if (!mid || !secret) return false;
  return timingSafeEqual(mid, env.PLATEGA_MERCHANT_ID) && timingSafeEqual(secret, env.PLATEGA_SECRET);
}

/**
 * Create hosted payment link.
 * `orderId` — our internal payment UUID (comes back via payload / lookup).
 * paymentMethod 2 = SBP/QR (common default); merchant can change in Platega cabinet.
 */
export async function createPlategaPayment(
  env: Env,
  input: {
    orderId: string;
    plan: Plan;
    telegramId: string;
    username?: string | null;
    returnUrl: string;
    failedUrl: string;
  },
): Promise<PlategaCreateResult> {
  // Do not send `id` — Platega generates transactionId. Our UUID lives in orderId + payload.
  const body = {
    paymentMethod: 2,
    paymentDetails: {
      amount: input.plan.priceRub,
      currency: 'RUB',
    },
    description: `SkinLab подписка: ${input.plan.title}`,
    return: input.returnUrl,
    failedUrl: input.failedUrl,
    payload: input.orderId,
    orderId: input.orderId,
    metadata: {
      userId: input.telegramId,
      userName: input.username ? `@${input.username.replace(/^@/, '')}` : input.telegramId,
    },
  };

  const res = await fetch(`${PLATEGA_BASE}/transaction/process`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.message === 'string' ? data.message : `platega_http_${res.status}`;
    throw new Error(msg);
  }

  const transactionId = String(data.transactionId || data.id || input.orderId);
  const url = String(data.url || data.redirect || '');
  if (!url) throw new Error('platega_missing_payment_url');

  return {
    transactionId,
    status: String(data.status || 'PENDING'),
    url,
  };
}

function pickAmount(data: Record<string, unknown>): number | undefined {
  if (typeof data.amount === 'number' && Number.isFinite(data.amount)) return data.amount;
  if (typeof data.Amount === 'number' && Number.isFinite(data.Amount)) return data.Amount;
  const details = data.paymentDetails;
  if (details && typeof details === 'object') {
    const amount = (details as Record<string, unknown>).amount;
    if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  }
  return undefined;
}

/** Re-check transaction so we do not trust callback body alone. */
export async function fetchPlategaTransaction(
  env: Env,
  transactionId: string,
): Promise<{ id: string; status: string; amount?: number } | null> {
  if (!env.PLATEGA_MERCHANT_ID || !env.PLATEGA_SECRET) return null;
  const res = await fetch(`${PLATEGA_BASE}/transaction/${encodeURIComponent(transactionId)}`, {
    headers: authHeaders(env),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return null;
  return {
    id: String(data.id || data.transactionId || transactionId),
    status: String(data.status || data.Status || ''),
    amount: pickAmount(data),
  };
}

export type PlategaCallbackBody = {
  id?: string;
  Id?: string;
  amount?: number;
  Amount?: number;
  currency?: string;
  Currency?: string;
  status?: string;
  Status?: string;
  payload?: string;
  Payload?: string;
  paymentMethod?: number;
};

export function normalizeCallback(body: PlategaCallbackBody): {
  id: string;
  status: string;
  amount: number | null;
  payload: string | null;
} {
  return {
    id: String(body.id || body.Id || ''),
    status: String(body.status || body.Status || '').toUpperCase(),
    amount: typeof body.amount === 'number' ? body.amount : typeof body.Amount === 'number' ? body.Amount : null,
    payload: (body.payload || body.Payload || null) as string | null,
  };
}
