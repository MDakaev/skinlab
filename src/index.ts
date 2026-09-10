/**
 * SkinLab Worker entry — Hono API + Telegram/Platega webhooks.
 * Static Mini App / legal / admin UI are served from the ASSETS binding.
 */

import { Hono } from 'hono';
import type { Env } from './env';
import { adminAuthorized } from './admin/auth';
import { drainBroadcasts } from './broadcast/runner';
import {
  cancelBroadcast,
  countBroadcastTargets,
  createBroadcast,
  createPayment,
  ensureOwnerSubscription,
  ensureTrialSubscription,
  getAdminStats,
  getPayment,
  getPaymentByPlategaTx,
  getSubscription,
  listBroadcasts,
  markPaymentStatus,
  setSubscription,
  setUserProfile,
  upsertUser,
  type BroadcastAudience,
  type UserProfile,
} from './db/queries';
import {
  computePaidUntil,
  getPlan,
  isOwnerTelegramId,
  isSubscriptionActive,
  OWNER_PAID_UNTIL,
  PLANS,
  TRIAL_DAYS,
  type PlanId,
} from './lib/plans';
import { validateInitData } from './lib/telegram-auth';
import {
  createPlategaPayment,
  fetchPlategaTransaction,
  normalizeCallback,
  verifyPlategaCallback,
  type PlategaCallbackBody,
} from './platega/client';
import { runReminderCron } from './reminders/scheduler';
import { callTelegram } from './telegram/api';
import { configureBot, handleTelegramUpdate } from './telegram/handlers';

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Telegram webhook / configure auth.
 * Prefer X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token).
 * Legacy ?secret= still accepted so existing webhooks keep working.
 */
function telegramSecretAuthorized(c: { env: Env; req: { query: (k: string) => string | undefined; header: (k: string) => string | undefined } }): boolean {
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || expected.length < 8 || expected === 'change-me-long-random') return false;
  const header = c.req.header('X-Telegram-Bot-Api-Secret-Token') || '';
  const query = c.req.query('secret') || '';
  return timingSafeEqual(header, expected) || timingSafeEqual(query, expected);
}

function publicOrigin(c: { env: Env; req: { url: string } }): string {
  if (c.env.PUBLIC_BASE_URL) return c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return new URL(c.req.url).origin;
}

app.get('/health', (c) =>
  c.json({
    ok: true,
    app: c.env.PUBLIC_APP_NAME || 'SkinLab',
    time: new Date().toISOString(),
  }),
);

/** Telegram webhook — secret_token header or legacy ?secret= */
app.post('/telegram/webhook', async (c) => {
  if (!telegramSecretAuthorized(c)) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ ok: false, error: 'bot_not_configured' }, 503);
  }

  let update: unknown;
  try {
    update = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  try {
    await handleTelegramUpdate(c.env, update as Parameters<typeof handleTelegramUpdate>[1], c.req.url);
  } catch (err) {
    console.error('telegram_webhook_error', err instanceof Error ? err.message : err);
    // Still 200 so Telegram does not retry forever on app bugs
  }
  return c.json({ ok: true });
});

/** One-shot: set commands + Menu Button. Protect with webhook secret. */
app.post('/telegram/configure', async (c) => {
  if (!telegramSecretAuthorized(c)) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  try {
    const results = await configureBot(c.env, c.req.url);
    return c.json({ ok: true, webAppUrl: publicOrigin(c) + '/', results });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'configure_failed' }, 502);
  }
});

app.get('/api/plans', (c) => c.json({ ok: true, plans: PLANS }));

/**
 * Validate Mini App initData, upsert user, return subscription status.
 * Body: { initData: string }
 */
app.post('/api/auth', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ ok: false, error: 'bot_not_configured' }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const validated = await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
  if (!validated) {
    return c.json({ ok: false, error: 'invalid_init_data' }, 401);
  }

  const telegramId = String(validated.user.id);
  const profile = await upsertUser(c.env.DB, {
    telegramId,
    username: validated.user.username ?? null,
    firstName: validated.user.first_name ?? null,
  });

  // Owner → forever free. Everyone else → one-time 3-day trial on first visit.
  let sub;
  let granted = false;
  let isOwner = false;
  if (isOwnerTelegramId(telegramId, c.env.OWNER_TELEGRAM_IDS)) {
    sub = await ensureOwnerSubscription(c.env.DB, telegramId);
    isOwner = true;
  } else {
    const trial = await ensureTrialSubscription(c.env.DB, telegramId);
    sub = trial.subscription;
    granted = trial.granted;
  }
  const active = isSubscriptionActive(sub.paid_until);
  const isTrial = sub.plan_id === 'trial';

  return c.json({
    ok: true,
    user: {
      id: validated.user.id,
      username: validated.user.username ?? null,
      firstName: validated.user.first_name ?? null,
    },
    profile,
    subscription: {
      active,
      planId: sub.plan_id,
      paidUntil: sub.paid_until,
      isTrial,
      isOwner,
      trialDays: TRIAL_DAYS,
      trialJustGranted: granted,
    },
  });
});

/**
 * Save Mini App profile blob. Body: { initData, profile }.
 * One UPSERT — client should debounce; quiz draft stays local until apply.
 */
app.put('/api/profile', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ ok: false, error: 'bot_not_configured' }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const profileRaw = body.profile;
  if (!profileRaw || typeof profileRaw !== 'object' || Array.isArray(profileRaw)) {
    return c.json({ ok: false, error: 'invalid_profile' }, 400);
  }
  const profile = profileRaw as UserProfile;
  if (JSON.stringify(profile).length > 24_576) {
    return c.json({ ok: false, error: 'profile_too_large' }, 413);
  }

  const validated = await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
  if (!validated) {
    return c.json({ ok: false, error: 'invalid_init_data' }, 401);
  }

  const telegramId = String(validated.user.id);
  const updatedAt = await setUserProfile(c.env.DB, {
    telegramId,
    profile,
    username: validated.user.username ?? null,
    firstName: validated.user.first_name ?? null,
  });

  return c.json({ ok: true, profile, updatedAt });
});

/**
 * Create Platega payment for a plan. Requires valid initData.
 * Body: { initData, planId }
 */
app.post('/api/checkout', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.PLATEGA_MERCHANT_ID || !c.env.PLATEGA_SECRET) {
    return c.json({ ok: false, error: 'payments_not_configured' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const planId = typeof body.planId === 'string' ? body.planId : '';
  const plan = getPlan(planId);
  if (!plan) return c.json({ ok: false, error: 'unknown_plan' }, 400);

  const validated = await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
  if (!validated) return c.json({ ok: false, error: 'invalid_init_data' }, 401);

  const telegramId = String(validated.user.id);
  await upsertUser(c.env.DB, {
    telegramId,
    username: validated.user.username ?? null,
    firstName: validated.user.first_name ?? null,
  });

  const orderId = crypto.randomUUID();
  const origin = publicOrigin(c);
  const returnUrl = `${origin}/?paid=1`;
  const failedUrl = `${origin}/?paid=0`;

  try {
    const created = await createPlategaPayment(c.env, {
      orderId,
      plan,
      telegramId,
      username: validated.user.username,
      returnUrl,
      failedUrl,
    });

    await createPayment(c.env.DB, {
      id: orderId,
      telegramId,
      planId: plan.id,
      amountRub: plan.priceRub,
      plategaTxId: created.transactionId,
    });

    return c.json({ ok: true, paymentId: orderId, url: created.url });
  } catch (err) {
    console.error('checkout_failed', err instanceof Error ? err.message : err);
    return c.json({ ok: false, error: 'checkout_failed' }, 502);
  }
});

/**
 * Platega callback — verify merchant headers, confirm payment, extend subscription.
 * Configure this URL in Platega cabinet: https://YOUR_HOST/api/platega/webhook
 */
app.post('/api/platega/webhook', async (c) => {
  if (!verifyPlategaCallback(c.env, c.req.raw.headers)) {
    return c.json({ ok: false }, 401);
  }

  const raw = (await c.req.json().catch(() => ({}))) as PlategaCallbackBody;
  const cb = normalizeCallback(raw);

  // Platega sends an empty POST when saving Callback URL — must return 200.
  if (!cb.id && !cb.payload) {
    return c.json({ ok: true, ping: true });
  }

  // Prefer our order id from payload; fall back to lookup by Platega tx id
  let payment = cb.payload ? await getPayment(c.env.DB, cb.payload) : null;
  if (!payment && cb.id) payment = await getPaymentByPlategaTx(c.env.DB, cb.id);
  if (!payment && cb.id) payment = await getPayment(c.env.DB, cb.id);

  if (!payment) {
    console.error('platega_unknown_payment', cb.id, cb.payload);
    return c.json({ ok: true, ignored: true });
  }

  if (cb.status === 'CANCELED' || cb.status === 'CANCELLED') {
    if (payment.status !== 'confirmed') {
      await markPaymentStatus(c.env.DB, payment.id, 'canceled', cb.id || payment.platega_tx_id);
    }
    return c.json({ ok: true });
  }

  // Chargeback can arrive after CONFIRMED — revoke access immediately.
  if (cb.status === 'CHARGEBACK' || cb.status === 'CHARGEBACKED') {
    await markPaymentStatus(c.env.DB, payment.id, 'chargeback', cb.id || payment.platega_tx_id);
    const sub = await getSubscription(c.env.DB, payment.telegram_id);
    if (sub && sub.plan_id !== 'owner') {
      await setSubscription(c.env.DB, {
        telegramId: payment.telegram_id,
        planId: (sub.plan_id || payment.plan_id) as PlanId,
        paidUntil: new Date().toISOString(),
      });
    }
    return c.json({ ok: true, revoked: true });
  }

  // Idempotent: already confirmed (ignore late duplicate CONFIRMED)
  if (payment.status === 'confirmed') {
    return c.json({ ok: true, duplicate: true });
  }

  if (cb.status !== 'CONFIRMED') {
    return c.json({ ok: true, ignored_status: cb.status });
  }

  // Mandatory re-check with Platega API — never confirm on callback body alone.
  const txId = cb.id || payment.platega_tx_id;
  if (!txId) {
    console.error('platega_missing_tx_id', payment.id);
    return c.json({ ok: false, error: 'missing_tx_id' }, 400);
  }

  const remote = await fetchPlategaTransaction(c.env, txId);
  if (!remote) {
    // 503 so Platega can retry when their API / our network is briefly down.
    console.error('platega_verify_unavailable', txId);
    return c.json({ ok: false, error: 'platega_verify_unavailable' }, 503);
  }
  if (!remote.status || remote.status.toUpperCase() !== 'CONFIRMED') {
    return c.json({ ok: true, pending_remote: remote.status || 'unknown' });
  }

  const plan = getPlan(payment.plan_id);
  if (!plan) {
    console.error('platega_unknown_plan', payment.plan_id);
    return c.json({ ok: false }, 500);
  }

  // Amount must match when Platega reports it (callback and/or remote).
  const externalAmount = cb.amount ?? remote.amount ?? null;
  if (externalAmount != null && externalAmount !== payment.amount_rub) {
    console.error('platega_amount_mismatch', externalAmount, payment.amount_rub);
    return c.json({ ok: false, error: 'amount_mismatch' }, 400);
  }

  const current = await getSubscription(c.env.DB, payment.telegram_id);
  const paidUntil = computePaidUntil(plan, current?.paid_until ?? null);

  await markPaymentStatus(c.env.DB, payment.id, 'confirmed', txId);
  await setSubscription(c.env.DB, {
    telegramId: payment.telegram_id,
    planId: plan.id,
    paidUntil,
  });

  return c.json({ ok: true, paidUntil });
});

app.get('/api/admin/stats', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);
  const stats = await getAdminStats(c.env.DB);
  return c.json({ ok: true, stats });
});

/**
 * Grant free access by telegram_id.
 * Body: { telegramId: string, days?: number | "forever" }
 * forever (default) → plan owner until 2099; number → plan gift for N days.
 */
app.post('/api/admin/grant', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const telegramId = String(body.telegramId ?? '').trim();
  if (!/^\d{3,20}$/.test(telegramId)) {
    return c.json({ ok: false, error: 'invalid_telegram_id' }, 400);
  }

  const daysRaw = body.days;
  let planId: PlanId;
  let paidUntil: string;

  if (daysRaw === undefined || daysRaw === null || daysRaw === 'forever' || daysRaw === 0) {
    planId = 'owner';
    paidUntil = OWNER_PAID_UNTIL;
  } else {
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return c.json({ ok: false, error: 'invalid_days' }, 400);
    }
    planId = 'gift';
    paidUntil = new Date(Date.now() + days * 864e5).toISOString();
  }

  await upsertUser(c.env.DB, { telegramId });
  await setSubscription(c.env.DB, { telegramId, planId, paidUntil });

  return c.json({ ok: true, telegramId, planId, paidUntil });
});

const BROADCAST_MAX = 4096;

function parseAudience(raw: unknown): BroadcastAudience | null {
  if (raw === 'all' || raw === 'active') return raw;
  return null;
}

/**
 * Broadcast to users who have started the bot.
 * Body: { text, audience?: "all" | "active", preview?: boolean }
 * preview → recipient count only. Otherwise queues a job and starts sending.
 */
app.post('/api/admin/broadcast', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: false, error: 'bot_not_configured' }, 503);

  const body = await c.req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const audience = parseAudience(body.audience ?? 'all');
  if (!audience) return c.json({ ok: false, error: 'invalid_audience' }, 400);
  if (!text || text.length > BROADCAST_MAX) {
    return c.json({ ok: false, error: 'invalid_text' }, 400);
  }

  const nowIso = new Date().toISOString();
  const recipients = await countBroadcastTargets(c.env.DB, audience, nowIso);
  if (body.preview === true) {
    return c.json({ ok: true, preview: true, audience, recipients });
  }
  if (recipients === 0) {
    return c.json({ ok: false, error: 'no_recipients' }, 400);
  }

  const id = crypto.randomUUID();
  await createBroadcast(c.env.DB, { id, text, audience, recipientsTotal: recipients });
  c.executionCtx.waitUntil(drainBroadcasts(c.env, 8));
  return c.json({ ok: true, id, audience, recipients, status: 'sending' });
});

/** Send the same text to one telegram_id — use before a full blast. */
app.post('/api/admin/broadcast/test', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: false, error: 'bot_not_configured' }, 503);

  const body = await c.req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const telegramId = String(body.telegramId ?? '').trim();
  if (!text || text.length > BROADCAST_MAX) {
    return c.json({ ok: false, error: 'invalid_text' }, 400);
  }
  if (!/^\d{3,20}$/.test(telegramId)) {
    return c.json({ ok: false, error: 'invalid_telegram_id' }, 400);
  }

  try {
    await callTelegram(c.env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: Number(telegramId),
      text,
      disable_web_page_preview: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed';
    return c.json({ ok: false, error: 'send_failed', message }, 502);
  }
  return c.json({ ok: true, telegramId });
});

app.get('/api/admin/broadcasts', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);
  const broadcasts = await listBroadcasts(c.env.DB);
  return c.json({ ok: true, broadcasts });
});

app.post('/api/admin/broadcast/cancel', async (c) => {
  if (!adminAuthorized(c)) return c.json({ ok: false, error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);
  const cancelled = await cancelBroadcast(c.env.DB, id);
  return c.json({ ok: true, cancelled });
});

/**
 * API 404 — let static assets handle non-API paths via the default export.
 */
app.notFound((c) => {
  if (c.req.path.startsWith('/api') || c.req.path.startsWith('/telegram')) {
    return c.json({ ok: false, error: 'not_found' }, 404);
  }
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  console.error('unhandled', err.message);
  return c.json({ ok: false, error: 'internal_error' }, 500);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route API / bot / health through Hono
    if (
      path === '/health' ||
      path.startsWith('/api/') ||
      path.startsWith('/telegram/')
    ) {
      return app.fetch(request, env, ctx);
    }

    // Everything else: static assets (Mini App, legal, admin)
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runReminderCron(env);
    await drainBroadcasts(env, 12);
  },
};
