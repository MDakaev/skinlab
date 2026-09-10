/**
 * Cron: send due morning/evening reminders.
 * Claim next_*_at before send to avoid duplicates on overlap/retry.
 */

import type { Env } from '../env';
import {
  claimEveningSend,
  claimMorningSend,
  disableReminders,
  listDueEvening,
  listDueMorning,
} from '../db/queries';
import { nextUtcIso } from './time';
import { callTelegram } from '../telegram/api';

export const MORNING_REMINDER_TEXT =
  '☀️ Не забудь про утреннюю рутину, твоя кожа скажет тебе спасибо!';
export const EVENING_REMINDER_TEXT =
  '🌙 Не забудь про уход перед сном! Позаботься о своей коже ❤️';

/** Stay well under Workers subrequest limit (~1000). */
const BATCH = 150;

function isPermanentTelegramBlock(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('blocked by the user') ||
    m.includes('user is deactivated') ||
    m.includes('chat not found') ||
    m.includes('bot was kicked') ||
    m.includes('forbidden')
  );
}

async function sendReminder(env: Env, telegramId: string, text: string): Promise<'ok' | 'blocked' | 'error'> {
  try {
    await callTelegram(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: Number(telegramId),
      text,
      disable_notification: false,
    });
    return 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isPermanentTelegramBlock(msg)) return 'blocked';
    console.error('reminder_send_failed', telegramId, msg);
    return 'error';
  }
}

async function processMorning(env: Env, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const rows = await listDueMorning(env.DB, nowIso, BATCH);
  let sent = 0;
  for (const row of rows) {
    if (!row.next_morning_at) continue;
    const nextAt = nextUtcIso(row.morning_minute_local, row.tz_offset_minutes, now);
    const claimed = await claimMorningSend(env.DB, row.telegram_id, row.next_morning_at, nextAt);
    if (!claimed) continue;

    const result = await sendReminder(env, row.telegram_id, MORNING_REMINDER_TEXT);
    if (result === 'ok') sent += 1;
    else if (result === 'blocked') await disableReminders(env.DB, row.telegram_id);
  }
  return sent;
}

async function processEvening(env: Env, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const rows = await listDueEvening(env.DB, nowIso, BATCH);
  let sent = 0;
  for (const row of rows) {
    if (!row.next_evening_at) continue;
    const nextAt = nextUtcIso(row.evening_minute_local, row.tz_offset_minutes, now);
    const claimed = await claimEveningSend(env.DB, row.telegram_id, row.next_evening_at, nextAt);
    if (!claimed) continue;

    const result = await sendReminder(env, row.telegram_id, EVENING_REMINDER_TEXT);
    if (result === 'ok') sent += 1;
    else if (result === 'blocked') await disableReminders(env.DB, row.telegram_id);
  }
  return sent;
}

export async function runReminderCron(env: Env): Promise<{ morning: number; evening: number }> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('reminder_cron_skipped_no_token');
    return { morning: 0, evening: 0 };
  }
  const now = new Date();
  const morning = await processMorning(env, now);
  const evening = await processEvening(env, now);
  if (morning || evening) {
    console.log('reminder_cron', { morning, evening });
  }
  return { morning, evening };
}
