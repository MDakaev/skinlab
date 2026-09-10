/**
 * Subscription plans — single source of truth for API, checkout, and Mini App.
 * Longer prepaid periods = lower effective monthly price (business rule).
 * New users get a one-time free trial (see TRIAL_DAYS).
 */

/** Paid checkout plans. */
export type PaidPlanId = 'm1' | 'm3' | 'm6' | 'm12';
/** trial = free 3 days; owner = forever; gift = admin-granted temporary access */
export type PlanId = PaidPlanId | 'trial' | 'owner' | 'gift';

/** Far-future date for owner unlock (ISO). */
export const OWNER_PAID_UNTIL = '2099-01-01T00:00:00.000Z';

export function parseOwnerIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isOwnerTelegramId(telegramId: string, ownerIdsRaw: string | undefined): boolean {
  return parseOwnerIds(ownerIdsRaw).has(String(telegramId));
}

export type Plan = {
  id: PaidPlanId;
  title: string;
  months: number;
  priceRub: number;
  /** Marketing line shown under the price. */
  perMonthLabel: string;
  badge?: string;
};

/** Free trial length for first-time users (once per telegram_id). */
export const TRIAL_DAYS = 3;

export const PLANS: Plan[] = [
  {
    id: 'm1',
    title: '1 месяц',
    months: 1,
    priceRub: 290,
    perMonthLabel: '290 ₽ / мес',
  },
  {
    id: 'm3',
    title: '3 месяца',
    months: 3,
    priceRub: 690,
    perMonthLabel: '230 ₽ / мес',
    badge: 'Выгодно',
  },
  {
    id: 'm6',
    title: '6 месяцев',
    months: 6,
    priceRub: 1190,
    perMonthLabel: '198 ₽ / мес',
    badge: 'Популярный',
  },
  {
    id: 'm12',
    title: '12 месяцев',
    months: 12,
    priceRub: 1990,
    perMonthLabel: '166 ₽ / мес',
    badge: 'Максимум',
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** ISO paid_until for a fresh trial starting now. */
export function computeTrialUntil(now = new Date()): string {
  const end = new Date(now.getTime() + TRIAL_DAYS * 864e5);
  return end.toISOString();
}

/** Extend from max(now, currentPaidUntil) by plan.months. */
export function computePaidUntil(plan: Plan, currentPaidUntilIso: string | null, now = new Date()): string {
  const baseMs = Math.max(now.getTime(), currentPaidUntilIso ? Date.parse(currentPaidUntilIso) : 0);
  const base = new Date(Number.isFinite(baseMs) ? baseMs : now.getTime());
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + plan.months);
  return next.toISOString();
}

export function isSubscriptionActive(paidUntilIso: string | null | undefined, now = new Date()): boolean {
  if (!paidUntilIso) return false;
  const t = Date.parse(paidUntilIso);
  return Number.isFinite(t) && t > now.getTime();
}
