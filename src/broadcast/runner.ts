/**
 * Admin broadcast drain. Telegram has no "send to all" — one sendMessage per user.
 * Batches stay small so a Worker tick does not hit subrequest / flood limits.
 * Cron and the admin request both call this; a row lock prevents double-sends.
 */

import type { Env } from '../env';
import {
  advanceBroadcast,
  claimBroadcast,
  listBroadcastTargets,
  markUserBotBlocked,
  type BroadcastAudience,
} from '../db/queries';
import { callTelegram } from '../telegram/api';

const BATCH = 25;

function classifySendError(message: string): 'blocked' | 'retry' | 'parse' | 'other' {
  const m = message.toLowerCase();
  if (
    m.includes('blocked by the user') ||
    m.includes('user is deactivated') ||
    m.includes('chat not found') ||
    m.includes('bot was kicked') ||
    m.includes('forbidden')
  ) {
    return 'blocked';
  }
  if (m.includes('too many requests') || m.includes('retry after')) return 'retry';
  if (m.includes('parse') || m.includes("can't find end") || m.includes('entity')) return 'parse';
  return 'other';
}

async function sendOne(
  env: Env,
  telegramId: string,
  text: string,
): Promise<'ok' | 'blocked' | 'retry' | 'parse' | 'error'> {
  try {
    await callTelegram(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: Number(telegramId),
      text,
      disable_web_page_preview: false,
    });
    return 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind = classifySendError(msg);
    if (kind === 'other') console.error('broadcast_send_failed', telegramId, msg);
    return kind === 'other' ? 'error' : kind;
  }
}

/**
 * Send one batch of the oldest unfinished broadcast.
 * Returns true if more work remains (caller may loop).
 */
export async function processBroadcastBatch(env: Env): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;

  const lockUntil = new Date(Date.now() + 90_000).toISOString();
  const job = await claimBroadcast(env.DB, lockUntil);
  if (!job) return false;

  const audience: BroadcastAudience = job.audience === 'active' ? 'active' : 'all';
  const nowIso = new Date().toISOString();
  const ids = await listBroadcastTargets(env.DB, audience, job.cursor_id, BATCH, nowIso);

  if (ids.length === 0) {
    await advanceBroadcast(env.DB, {
      id: job.id,
      cursorId: job.cursor_id,
      sent: 0,
      failed: 0,
      blocked: 0,
      done: true,
    });
    return false;
  }

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let cursor = job.cursor_id;
  let stopForRetry = false;

  for (const id of ids) {
    const result = await sendOne(env, id, job.text);
    if (result === 'retry') {
      stopForRetry = true;
      break;
    }
    cursor = id;
    if (result === 'ok') sent += 1;
    else if (result === 'blocked') {
      blocked += 1;
      await markUserBotBlocked(env.DB, id);
    } else if (result === 'parse') {
      failed += 1;
      console.error('broadcast_parse_failed', job.id);
      await advanceBroadcast(env.DB, {
        id: job.id,
        cursorId: cursor,
        sent,
        failed,
        blocked,
        done: true,
      });
      return false;
    } else {
      failed += 1;
    }
  }

  const done = !stopForRetry && ids.length < BATCH;
  await advanceBroadcast(env.DB, {
    id: job.id,
    cursorId: cursor,
    sent,
    failed,
    blocked,
    done,
  });
  return !done;
}

/** Drain a few batches. Safe to call from waitUntil and from cron. */
export async function drainBroadcasts(env: Env, maxBatches = 6): Promise<void> {
  for (let i = 0; i < maxBatches; i++) {
    const more = await processBroadcastBatch(env);
    if (!more) return;
  }
}
