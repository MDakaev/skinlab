/**
 * D1 accessors — users, subscriptions, payments, reminders.
 * All timestamps are ISO-8601 UTC strings.
 */

import { computeTrialUntil, OWNER_PAID_UNTIL, type PaidPlanId, type PlanId } from '../lib/plans';
import { recomputeNextAts } from '../reminders/time';

export type UserRow = {
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  profile_json: string | null;
  profile_updated_at: string | null;
};

/** Parsed Mini App profile blob (shape owned by web/shared/storage.js). */
export type UserProfile = Record<string, unknown>;

export function parseProfileJson(raw: string | null | undefined): UserProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as UserProfile;
  } catch {
    return null;
  }
}

export type SubscriptionRow = {
  telegram_id: string;
  plan_id: string | null;
  paid_until: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  telegram_id: string;
  plan_id: string;
  amount_rub: number;
  status: string;
  platega_tx_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Touch / create user row. Returns existing profile_json (null for brand-new users)
 * via RETURNING — no extra D1 read on /api/auth.
 */
export async function upsertUser(
  db: D1Database,
  input: { telegramId: string; username?: string | null; firstName?: string | null },
): Promise<UserProfile | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_seen_at = excluded.last_seen_at,
         bot_blocked = 0
       RETURNING profile_json`,
    )
    .bind(input.telegramId, input.username ?? null, input.firstName ?? null, now, now)
    .first<{ profile_json: string | null }>();
  return parseProfileJson(row?.profile_json);
}

/** One UPSERT write for Mini App profile blob. */
export async function setUserProfile(
  db: D1Database,
  input: {
    telegramId: string;
    profile: UserProfile;
    username?: string | null;
    firstName?: string | null;
  },
): Promise<string> {
  const now = new Date().toISOString();
  const json = JSON.stringify(input.profile);
  await db
    .prepare(
      `INSERT INTO users (
         telegram_id, username, first_name, first_seen_at, last_seen_at,
         profile_json, profile_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         profile_json = excluded.profile_json,
         profile_updated_at = excluded.profile_updated_at,
         last_seen_at = excluded.last_seen_at,
         username = COALESCE(excluded.username, users.username),
         first_name = COALESCE(excluded.first_name, users.first_name)`,
    )
    .bind(
      input.telegramId,
      input.username ?? null,
      input.firstName ?? null,
      now,
      now,
      json,
      now,
    )
    .run();
  return now;
}

export async function getSubscription(db: D1Database, telegramId: string): Promise<SubscriptionRow | null> {
  return (
    (await db
      .prepare(`SELECT telegram_id, plan_id, paid_until, updated_at FROM subscriptions WHERE telegram_id = ?`)
      .bind(telegramId)
      .first<SubscriptionRow>()) || null
  );
}

export async function setSubscription(
  db: D1Database,
  input: { telegramId: string; planId: PlanId; paidUntil: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO subscriptions (telegram_id, plan_id, paid_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         plan_id = excluded.plan_id,
         paid_until = excluded.paid_until,
         updated_at = excluded.updated_at`,
    )
    .bind(input.telegramId, input.planId, input.paidUntil, now)
    .run();
}

/**
 * One-time free trial: only if this telegram_id has never had a subscriptions row.
 * Expired trials are NOT renewed — user must pay.
 */
export async function ensureTrialSubscription(
  db: D1Database,
  telegramId: string,
): Promise<{ subscription: SubscriptionRow; granted: boolean }> {
  const existing = await getSubscription(db, telegramId);
  if (existing) {
    return { subscription: existing, granted: false };
  }
  const paidUntil = computeTrialUntil();
  await setSubscription(db, { telegramId, planId: 'trial', paidUntil });
  const subscription = (await getSubscription(db, telegramId))!;
  return { subscription, granted: true };
}

/**
 * Owner unlock: always keep plan_id=owner and far-future paid_until.
 * Call when telegram id is listed in OWNER_TELEGRAM_IDS.
 */
export async function ensureOwnerSubscription(
  db: D1Database,
  telegramId: string,
): Promise<SubscriptionRow> {
  const existing = await getSubscription(db, telegramId);
  if (existing?.plan_id === 'owner' && existing.paid_until === OWNER_PAID_UNTIL) {
    return existing;
  }
  await setSubscription(db, {
    telegramId,
    planId: 'owner',
    paidUntil: OWNER_PAID_UNTIL,
  });
  return (await getSubscription(db, telegramId))!;
}

export async function createPayment(
  db: D1Database,
  input: {
    id: string;
    telegramId: string;
    planId: PaidPlanId;
    amountRub: number;
    plategaTxId?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO payments (id, telegram_id, plan_id, amount_rub, status, platega_tx_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(input.id, input.telegramId, input.planId, input.amountRub, input.plategaTxId ?? null, now, now)
    .run();
}

export async function getPayment(db: D1Database, id: string): Promise<PaymentRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, telegram_id, plan_id, amount_rub, status, platega_tx_id, created_at, updated_at
         FROM payments WHERE id = ?`,
      )
      .bind(id)
      .first<PaymentRow>()) || null
  );
}

export async function getPaymentByPlategaTx(db: D1Database, plategaTxId: string): Promise<PaymentRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, telegram_id, plan_id, amount_rub, status, platega_tx_id, created_at, updated_at
         FROM payments WHERE platega_tx_id = ?`,
      )
      .bind(plategaTxId)
      .first<PaymentRow>()) || null
  );
}

export async function markPaymentStatus(
  db: D1Database,
  id: string,
  status: string,
  plategaTxId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  if (plategaTxId) {
    await db
      .prepare(`UPDATE payments SET status = ?, platega_tx_id = ?, updated_at = ? WHERE id = ?`)
      .bind(status, plategaTxId, now, id)
      .run();
  } else {
    await db.prepare(`UPDATE payments SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
  }
}

export type ReminderSetupStep = 'morning' | 'evening' | 'timezone' | 'timezone_custom' | null;

export type ReminderRow = {
  telegram_id: string;
  enabled: number;
  tz_offset_minutes: number;
  morning_minute_local: number;
  evening_minute_local: number;
  next_morning_at: string | null;
  next_evening_at: string | null;
  setup_step: string | null;
  updated_at: string;
};

/** Default: off, Moscow UTC+3, 08:00 / 21:00 local. */
export const REMINDER_DEFAULTS = {
  enabled: 0,
  tzOffsetMinutes: 180,
  morningMinuteLocal: 480,
  eveningMinuteLocal: 1260,
} as const;

/** When true, cron only sends to users with active paid_until. Off for MVP. */
export const REMINDERS_REQUIRE_ACTIVE_SUB = false;

const REMINDER_SELECT = `telegram_id, enabled, tz_offset_minutes, morning_minute_local,
  evening_minute_local, next_morning_at, next_evening_at, setup_step, updated_at`;

export async function getReminderSettings(
  db: D1Database,
  telegramId: string,
): Promise<ReminderRow | null> {
  return (
    (await db
      .prepare(`SELECT ${REMINDER_SELECT} FROM reminder_settings WHERE telegram_id = ?`)
      .bind(telegramId)
      .first<ReminderRow>()) || null
  );
}

/** Ensure a row exists (enabled=0). Does not change existing settings. */
export async function ensureReminderSettings(
  db: D1Database,
  telegramId: string,
): Promise<ReminderRow> {
  const existing = await getReminderSettings(db, telegramId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const next = recomputeNextAts(
    REMINDER_DEFAULTS.morningMinuteLocal,
    REMINDER_DEFAULTS.eveningMinuteLocal,
    REMINDER_DEFAULTS.tzOffsetMinutes,
  );
  await db
    .prepare(
      `INSERT INTO reminder_settings (
         telegram_id, enabled, tz_offset_minutes, morning_minute_local, evening_minute_local,
         next_morning_at, next_evening_at, setup_step, updated_at
       ) VALUES (?, 0, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(telegram_id) DO NOTHING`,
    )
    .bind(
      telegramId,
      REMINDER_DEFAULTS.tzOffsetMinutes,
      REMINDER_DEFAULTS.morningMinuteLocal,
      REMINDER_DEFAULTS.eveningMinuteLocal,
      next.nextMorningAt,
      next.nextEveningAt,
      now,
    )
    .run();
  return (await getReminderSettings(db, telegramId))!;
}

export async function setReminderSetupStep(
  db: D1Database,
  telegramId: string,
  step: ReminderSetupStep,
): Promise<void> {
  const now = new Date().toISOString();
  await ensureReminderSettings(db, telegramId);
  await db
    .prepare(`UPDATE reminder_settings SET setup_step = ?, updated_at = ? WHERE telegram_id = ?`)
    .bind(step, now, telegramId)
    .run();
}

export async function updateReminderSettings(
  db: D1Database,
  telegramId: string,
  patch: {
    enabled?: boolean;
    tzOffsetMinutes?: number;
    morningMinuteLocal?: number;
    eveningMinuteLocal?: number;
    setupStep?: ReminderSetupStep;
  },
): Promise<ReminderRow> {
  const row = await ensureReminderSettings(db, telegramId);
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled;
  const tz = patch.tzOffsetMinutes ?? row.tz_offset_minutes;
  const morning = patch.morningMinuteLocal ?? row.morning_minute_local;
  const evening = patch.eveningMinuteLocal ?? row.evening_minute_local;
  const setupStep = patch.setupStep !== undefined ? patch.setupStep : row.setup_step;
  const now = new Date();
  const next = recomputeNextAts(morning, evening, tz, now);
  const nowIso = now.toISOString();

  await db
    .prepare(
      `UPDATE reminder_settings SET
         enabled = ?,
         tz_offset_minutes = ?,
         morning_minute_local = ?,
         evening_minute_local = ?,
         next_morning_at = ?,
         next_evening_at = ?,
         setup_step = ?,
         updated_at = ?
       WHERE telegram_id = ?`,
    )
    .bind(
      enabled,
      tz,
      morning,
      evening,
      next.nextMorningAt,
      next.nextEveningAt,
      setupStep,
      nowIso,
      telegramId,
    )
    .run();

  return (await getReminderSettings(db, telegramId))!;
}

export type DueReminder = {
  telegram_id: string;
  tz_offset_minutes: number;
  morning_minute_local: number;
  evening_minute_local: number;
  next_morning_at: string;
  next_evening_at: string;
};

/**
 * Due morning slots. Optional subscription gate via REMINDERS_REQUIRE_ACTIVE_SUB.
 */
export async function listDueMorning(
  db: D1Database,
  nowIso: string,
  limit: number,
): Promise<DueReminder[]> {
  if (REMINDERS_REQUIRE_ACTIVE_SUB) {
    return (
      (
        await db
          .prepare(
            `SELECT r.telegram_id, r.tz_offset_minutes, r.morning_minute_local, r.evening_minute_local,
                    r.next_morning_at, r.next_evening_at
             FROM reminder_settings r
             INNER JOIN subscriptions s ON s.telegram_id = r.telegram_id
             WHERE r.enabled = 1
               AND r.next_morning_at IS NOT NULL
               AND r.next_morning_at <= ?
               AND s.paid_until > ?
             ORDER BY r.next_morning_at
             LIMIT ?`,
          )
          .bind(nowIso, nowIso, limit)
          .all<DueReminder>()
      ).results ?? []
    );
  }
  return (
    (
      await db
        .prepare(
          `SELECT telegram_id, tz_offset_minutes, morning_minute_local, evening_minute_local,
                  next_morning_at, next_evening_at
           FROM reminder_settings
           WHERE enabled = 1
             AND next_morning_at IS NOT NULL
             AND next_morning_at <= ?
           ORDER BY next_morning_at
           LIMIT ?`,
        )
        .bind(nowIso, limit)
        .all<DueReminder>()
    ).results ?? []
  );
}

export async function listDueEvening(
  db: D1Database,
  nowIso: string,
  limit: number,
): Promise<DueReminder[]> {
  if (REMINDERS_REQUIRE_ACTIVE_SUB) {
    return (
      (
        await db
          .prepare(
            `SELECT r.telegram_id, r.tz_offset_minutes, r.morning_minute_local, r.evening_minute_local,
                    r.next_morning_at, r.next_evening_at
             FROM reminder_settings r
             INNER JOIN subscriptions s ON s.telegram_id = r.telegram_id
             WHERE r.enabled = 1
               AND r.next_evening_at IS NOT NULL
               AND r.next_evening_at <= ?
               AND s.paid_until > ?
             ORDER BY r.next_evening_at
             LIMIT ?`,
          )
          .bind(nowIso, nowIso, limit)
          .all<DueReminder>()
      ).results ?? []
    );
  }
  return (
    (
      await db
        .prepare(
          `SELECT telegram_id, tz_offset_minutes, morning_minute_local, evening_minute_local,
                  next_morning_at, next_evening_at
           FROM reminder_settings
           WHERE enabled = 1
             AND next_evening_at IS NOT NULL
             AND next_evening_at <= ?
           ORDER BY next_evening_at
           LIMIT ?`,
        )
        .bind(nowIso, limit)
        .all<DueReminder>()
    ).results ?? []
  );
}

/** Optimistic claim: advance next_* only if still equal to expectedDueAt. */
export async function claimMorningSend(
  db: D1Database,
  telegramId: string,
  expectedDueAt: string,
  nextMorningAt: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE reminder_settings
       SET next_morning_at = ?, updated_at = ?
       WHERE telegram_id = ? AND enabled = 1 AND next_morning_at = ?`,
    )
    .bind(nextMorningAt, now, telegramId, expectedDueAt)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function claimEveningSend(
  db: D1Database,
  telegramId: string,
  expectedDueAt: string,
  nextEveningAt: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE reminder_settings
       SET next_evening_at = ?, updated_at = ?
       WHERE telegram_id = ? AND enabled = 1 AND next_evening_at = ?`,
    )
    .bind(nextEveningAt, now, telegramId, expectedDueAt)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function disableReminders(db: D1Database, telegramId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE reminder_settings SET enabled = 0, setup_step = NULL, updated_at = ? WHERE telegram_id = ?`,
    )
    .bind(now, telegramId)
    .run();
}

export type AdminActiveSub = {
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  plan_id: string;
  paid_until: string;
  updated_at: string;
};

export type AdminStats = {
  usersTotal: number;
  usersNew7d: number;
  usersNew30d: number;
  activeSubs: number;
  paymentsConfirmedCount: number;
  paymentsConfirmedSumRub: number;
  activeSubscriptions: AdminActiveSub[];
  recentUsers: UserRow[];
  recentPayments: PaymentRow[];
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getAdminStats(db: D1Database): Promise<AdminStats> {
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5).toISOString();
  const d30 = new Date(now - 30 * 864e5).toISOString();
  const nowIso = new Date(now).toISOString();

  const usersTotal = num((await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())?.n);
  const usersNew7d = num(
    (await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE first_seen_at >= ?`).bind(d7).first<{ n: number }>())?.n,
  );
  const usersNew30d = num(
    (await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE first_seen_at >= ?`).bind(d30).first<{ n: number }>())?.n,
  );
  const activeSubs = num(
    (
      await db
        .prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE paid_until > ?`)
        .bind(nowIso)
        .first<{ n: number }>()
    )?.n,
  );

  const payAgg = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_rub), 0) AS s FROM payments WHERE status = 'confirmed'`,
    )
    .first<{ n: number; s: number }>();

  const activeSubscriptions =
    (
      await db
        .prepare(
          `SELECT s.telegram_id, u.username, u.first_name, s.plan_id, s.paid_until, s.updated_at
           FROM subscriptions s
           LEFT JOIN users u ON u.telegram_id = s.telegram_id
           WHERE s.paid_until > ?
           ORDER BY s.paid_until DESC
           LIMIT 50`,
        )
        .bind(nowIso)
        .all<AdminActiveSub>()
    ).results ?? [];

  const recentUsers =
    (
      await db
        .prepare(
          `SELECT telegram_id, username, first_name, first_seen_at, last_seen_at
           FROM users ORDER BY last_seen_at DESC LIMIT 20`,
        )
        .all<UserRow>()
    ).results ?? [];

  const recentPayments =
    (
      await db
        .prepare(
          `SELECT id, telegram_id, plan_id, amount_rub, status, platega_tx_id, created_at, updated_at
           FROM payments ORDER BY created_at DESC LIMIT 20`,
        )
        .all<PaymentRow>()
    ).results ?? [];

  return {
    usersTotal,
    usersNew7d,
    usersNew30d,
    activeSubs,
    paymentsConfirmedCount: num(payAgg?.n),
    paymentsConfirmedSumRub: num(payAgg?.s),
    activeSubscriptions,
    recentUsers,
    recentPayments,
  };
}

export type BroadcastAudience = 'all' | 'active';

export type BroadcastRow = {
  id: string;
  text: string;
  audience: string;
  status: string;
  cursor_id: string;
  sent: number;
  failed: number;
  blocked: number;
  recipients_total: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

function audienceFilter(audience: BroadcastAudience): string {
  if (audience === 'active') {
    return `AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.telegram_id = u.telegram_id AND s.paid_until > ?
    )`;
  }
  return '';
}

export async function countBroadcastTargets(
  db: D1Database,
  audience: BroadcastAudience,
  nowIso: string,
): Promise<number> {
  const extra = audienceFilter(audience);
  const stmt = db.prepare(
    `SELECT COUNT(*) AS n FROM users u
     WHERE u.bot_blocked = 0
     ${extra}`,
  );
  const row =
    audience === 'active'
      ? await stmt.bind(nowIso).first<{ n: number }>()
      : await stmt.first<{ n: number }>();
  return num(row?.n);
}

export async function createBroadcast(
  db: D1Database,
  input: {
    id: string;
    text: string;
    audience: BroadcastAudience;
    recipientsTotal: number;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO broadcasts (
         id, text, audience, status, cursor_id, recipients_total, created_at, updated_at
       ) VALUES (?, ?, ?, 'queued', '', ?, ?, ?)`,
    )
    .bind(input.id, input.text, input.audience, input.recipientsTotal, now, now)
    .run();
}

const BROADCAST_SELECT = `id, text, audience, status, cursor_id, sent, failed, blocked,
                  recipients_total, locked_until, created_at, updated_at, finished_at`;

export async function listBroadcasts(db: D1Database, limit = 20): Promise<BroadcastRow[]> {
  return (
    (
      await db
        .prepare(
          `SELECT ${BROADCAST_SELECT}
           FROM broadcasts ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(limit)
        .all<BroadcastRow>()
    ).results ?? []
  );
}

export async function getBroadcast(db: D1Database, id: string): Promise<BroadcastRow | null> {
  return (
    (await db
      .prepare(`SELECT ${BROADCAST_SELECT} FROM broadcasts WHERE id = ?`)
      .bind(id)
      .first<BroadcastRow>()) || null
  );
}

/** Claim the oldest unfinished broadcast so two workers don't send the same batch. */
export async function claimBroadcast(db: D1Database, lockUntilIso: string): Promise<BroadcastRow | null> {
  const nowIso = new Date().toISOString();
  const candidate = await db
    .prepare(
      `SELECT id FROM broadcasts
       WHERE status IN ('queued', 'sending')
         AND (locked_until IS NULL OR locked_until < ?)
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(nowIso)
    .first<{ id: string }>();
  if (!candidate) return null;

  const res = await db
    .prepare(
      `UPDATE broadcasts
       SET status = 'sending', locked_until = ?, updated_at = ?
       WHERE id = ?
         AND status IN ('queued', 'sending')
         AND (locked_until IS NULL OR locked_until < ?)`,
    )
    .bind(lockUntilIso, nowIso, candidate.id, nowIso)
    .run();
  if ((res.meta.changes ?? 0) < 1) return null;
  return getBroadcast(db, candidate.id);
}

export async function listBroadcastTargets(
  db: D1Database,
  audience: BroadcastAudience,
  afterId: string,
  limit: number,
  nowIso: string,
): Promise<string[]> {
  const extra = audienceFilter(audience);
  const stmt = db.prepare(
    `SELECT u.telegram_id FROM users u
     WHERE u.bot_blocked = 0
       AND CAST(u.telegram_id AS INTEGER) > CAST(? AS INTEGER)
       ${extra}
     ORDER BY CAST(u.telegram_id AS INTEGER)
     LIMIT ?`,
  );
  const cursor = afterId || '0';
  const rows =
    audience === 'active'
      ? await stmt.bind(cursor, nowIso, limit).all<{ telegram_id: string }>()
      : await stmt.bind(cursor, limit).all<{ telegram_id: string }>();
  return (rows.results ?? []).map((r) => r.telegram_id);
}

export async function advanceBroadcast(
  db: D1Database,
  input: {
    id: string;
    cursorId: string;
    sent: number;
    failed: number;
    blocked: number;
    done: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  if (input.done) {
    await db
      .prepare(
        `UPDATE broadcasts
         SET cursor_id = ?, sent = sent + ?, failed = failed + ?, blocked = blocked + ?,
             status = 'done', finished_at = ?, locked_until = NULL, updated_at = ?
         WHERE id = ? AND status = 'sending'`,
      )
      .bind(input.cursorId, input.sent, input.failed, input.blocked, now, now, input.id)
      .run();
    return;
  }
  await db
    .prepare(
      `UPDATE broadcasts
       SET cursor_id = ?, sent = sent + ?, failed = failed + ?, blocked = blocked + ?,
           locked_until = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending'`,
    )
    .bind(input.cursorId, input.sent, input.failed, input.blocked, now, input.id)
    .run();
}

export async function cancelBroadcast(db: D1Database, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE broadcasts
       SET status = 'cancelled', finished_at = ?, locked_until = NULL, updated_at = ?
       WHERE id = ? AND status IN ('queued', 'sending')`,
    )
    .bind(now, now, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function markUserBotBlocked(db: D1Database, telegramId: string): Promise<void> {
  await db.prepare(`UPDATE users SET bot_blocked = 1 WHERE telegram_id = ?`).bind(telegramId).run();
}
