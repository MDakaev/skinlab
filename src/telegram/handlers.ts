/**
 * Telegram update handling: /start, reply buttons, deep-link to Mini App.
 */

import type { Env } from '../env';
import { ensureOwnerSubscription, ensureTrialSubscription, upsertUser } from '../db/queries';
import {
  clearReminderWizard,
  handleRemindersMessage,
  shouldHandleReminders,
} from '../reminders/bot';
import {
  agreementMessage,
  callTelegram,
  infoMessage,
  legalInlineKeyboard,
  privacyMessage,
  replyKeyboard,
  startMessage,
  supportMessage,
  tipMessage,
} from './api';
import { isOwnerTelegramId, TRIAL_DAYS } from '../lib/plans';

type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: TgUser;
};
type TgUpdate = { update_id: number; message?: TgMessage };

function publicBase(env: Env, requestUrl: string): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return new URL(requestUrl).origin;
}

async function sendText(
  env: Env,
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await callTelegram(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
    ...extra,
  });
}

function isLegalCommand(text: string, lower: string): 'terms' | 'privacy' | null {
  if (
    text.startsWith('/terms') ||
    text === '📄 Соглашение' ||
    lower === 'соглашение' ||
    lower === 'оферта'
  ) {
    return 'terms';
  }
  if (
    text.startsWith('/privacy') ||
    text === '🔒 Конфиденциальность' ||
    lower === 'конфиденциальность' ||
    lower === 'политика'
  ) {
    return 'privacy';
  }
  return null;
}

/**
 * Process one Update. Always safe to call; ignores unknown payloads.
 */
export async function handleTelegramUpdate(env: Env, update: TgUpdate, requestUrl: string): Promise<void> {
  const msg = update.message;
  if (!msg?.chat?.id || !msg.text) return;

  const chatId = msg.chat.id;
  const from = msg.from;
  const telegramId = from?.id ? String(from.id) : null;
  let trialGranted = false;
  let ownerUnlocked = false;
  if (telegramId) {
    await upsertUser(env.DB, {
      telegramId,
      username: from?.username ?? null,
      firstName: from?.first_name ?? null,
    });
    if (isOwnerTelegramId(telegramId, env.OWNER_TELEGRAM_IDS)) {
      await ensureOwnerSubscription(env.DB, telegramId);
      ownerUnlocked = true;
    } else {
      const trial = await ensureTrialSubscription(env.DB, telegramId);
      trialGranted = trial.granted;
    }
  }

  const text = msg.text.trim();
  const base = publicBase(env, requestUrl);
  const lower = text.toLowerCase();

  if (text.startsWith('/start') || text === '🌿 Открыть SkinLab') {
    if (telegramId) await clearReminderWizard(env, telegramId);
    let extra = `\n\nНовым пользователям даём ${TRIAL_DAYS} дня бесплатно при первом запуске.`;
    if (ownerUnlocked) extra = `\n\n👑 Владелец: полный доступ без подписки.`;
    else if (trialGranted)
      extra = `\n\n🎁 Тебе открыт пробный доступ на ${TRIAL_DAYS} дня — оцени SkinLab без оплаты.`;
    await sendText(env, chatId, startMessage(from?.first_name) + extra, {
      reply_markup: replyKeyboard(),
    });
    await sendText(env, chatId, 'Документы и приложение:', {
      reply_markup: legalInlineKeyboard(base),
    });
    return;
  }

  // Reminders wizard (menu + time/timezone steps)
  if (telegramId && (await shouldHandleReminders(env, telegramId, text, lower))) {
    const handled = await handleRemindersMessage(env, chatId, telegramId, text);
    if (handled) return;
  }

  const legal = isLegalCommand(text, lower);
  if (legal === 'terms') {
    await sendText(env, chatId, agreementMessage(base), {
      reply_markup: legalInlineKeyboard(base),
    });
    return;
  }
  if (legal === 'privacy') {
    await sendText(env, chatId, privacyMessage(base), {
      reply_markup: legalInlineKeyboard(base),
    });
    return;
  }

  if (text.startsWith('/help') || text === 'ℹ️ Инфо' || lower === 'инфо') {
    if (telegramId) await clearReminderWizard(env, telegramId);
    await sendText(env, chatId, infoMessage(env.SUPPORT_USERNAME, env.SUPPORT_EMAIL), {
      reply_markup: replyKeyboard(),
    });
    await sendText(env, chatId, 'Открыть документы:', {
      reply_markup: legalInlineKeyboard(base),
    });
    return;
  }

  if (text === '💡 Совет' || lower === 'совет') {
    await sendText(env, chatId, tipMessage(), { reply_markup: replyKeyboard() });
    return;
  }

  if (text === '💬 Поддержка' || lower === 'поддержка' || text.startsWith('/support')) {
    await sendText(env, chatId, supportMessage(env.SUPPORT_USERNAME, env.SUPPORT_EMAIL), {
      reply_markup: replyKeyboard(),
    });
    return;
  }

  // Fallback: nudge toward Mini App + legal
  await sendText(env, chatId, 'Открой SkinLab или выбери «Соглашение» / «Конфиденциальность» / «Поддержка».', {
    reply_markup: legalInlineKeyboard(base),
  });
}

/**
 * One-shot bot presentation (commands + menu button). Call after deploy.
 */
export async function configureBot(env: Env, requestUrl: string): Promise<Record<string, unknown>> {
  const appUrl = publicBase(env, requestUrl) + '/';
  const token = env.TELEGRAM_BOT_TOKEN;
  const results: Record<string, unknown> = {};
  results.commands = await callTelegram(token, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'Запуск и приложение' },
      { command: 'reminders', description: 'Ежедневные напоминания' },
      { command: 'help', description: 'О SkinLab и тарифах' },
      { command: 'terms', description: 'Пользовательское соглашение' },
      { command: 'privacy', description: 'Политика конфиденциальности' },
      { command: 'support', description: 'Контакты поддержки' },
    ],
  });
  results.description = await callTelegram(token, 'setMyDescription', {
    description:
      'SkinLab — помощник по уходу за кожей. Mini App с подпиской: подсказки, рутины и справочные материалы. ' +
      'Соглашение и политика конфиденциальности — в меню бота (/terms, /privacy).',
  });
  results.shortDescription = await callTelegram(token, 'setMyShortDescription', {
    short_description: 'Помощник по уходу за кожей',
  });
  results.menuButton = await callTelegram(token, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'SkinLab', web_app: { url: appUrl } },
  });
  return results;
}
