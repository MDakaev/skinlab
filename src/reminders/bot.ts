/**
 * Bot UX for reminder settings (reply-keyboard wizard).
 * Only touches D1 when the user is in the reminders flow.
 */

import type { Env } from '../env';
import {
  ensureReminderSettings,
  getReminderSettings,
  setReminderSetupStep,
  updateReminderSettings,
  type ReminderRow,
} from '../db/queries';
import {
  callTelegram,
  eveningTimeKeyboard,
  morningTimeKeyboard,
  reminderStatusMessage,
  remindersMenuKeyboard,
  replyKeyboard,
  TIMEZONE_CUSTOM_HINT,
  TIMEZONE_PICK_HINT,
  TIMEZONE_PRESETS,
  timezoneCustomKeyboard,
  timezoneKeyboard,
} from '../telegram/api';
import { formatHhMm, formatOffset, parseHhMm, parseUtcOffset } from './time';

const MENU_ACTIONS = new Set([
  '✅ Включить',
  '⏸ Выключить',
  '🌅 Утро',
  '🌙 Вечер',
  '🌐 Часовой пояс',
  '✏️ Другой пояс',
  '« Назад',
  '« Назад к напоминаниям',
  '« Назад к выбору пояса',
]);

async function sendText(
  env: Env,
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await callTelegram(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

function statusText(row: ReminderRow): string {
  return reminderStatusMessage({
    enabled: row.enabled === 1,
    morning: formatHhMm(row.morning_minute_local),
    evening: formatHhMm(row.evening_minute_local),
    offsetLabel: formatOffset(row.tz_offset_minutes),
  });
}

async function showMenu(env: Env, chatId: number, telegramId: string): Promise<void> {
  await setReminderSetupStep(env.DB, telegramId, null);
  const row = await ensureReminderSettings(env.DB, telegramId);
  await sendText(env, chatId, statusText(row), {
    reply_markup: remindersMenuKeyboard(),
  });
}

export function isRemindersEntry(text: string, lower: string): boolean {
  return text.startsWith('/reminders') || text === '⏰ Напоминания' || lower === 'напоминания';
}

/**
 * True if this message should be routed to the reminders wizard
 * (avoids ensureReminderSettings on unrelated bot traffic).
 */
export async function shouldHandleReminders(
  env: Env,
  telegramId: string | null,
  text: string,
  lower: string,
): Promise<boolean> {
  if (isRemindersEntry(text, lower)) return true;
  // Slash commands (except /reminders) leave the wizard to the main router
  if (text.startsWith('/') && !text.startsWith('/reminders')) return false;
  if (MENU_ACTIONS.has(text)) return true;
  if (!telegramId) return false;
  const row = await getReminderSettings(env.DB, telegramId);
  return Boolean(row?.setup_step);
}

/**
 * Handle reminders menu / wizard. Returns true if the update was consumed.
 */
export async function handleRemindersMessage(
  env: Env,
  chatId: number,
  telegramId: string,
  text: string,
): Promise<boolean> {
  const lower = text.toLowerCase();

  if (isRemindersEntry(text, lower)) {
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (text === '« Назад') {
    const existing = await getReminderSettings(env.DB, telegramId);
    if (existing?.setup_step) await setReminderSetupStep(env.DB, telegramId, null);
    await sendText(env, chatId, 'Главное меню.', { reply_markup: replyKeyboard() });
    return true;
  }

  if (text === '« Назад к напоминаниям') {
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (text === '« Назад к выбору пояса') {
    await setReminderSetupStep(env.DB, telegramId, 'timezone');
    await sendText(env, chatId, TIMEZONE_PICK_HINT, { reply_markup: timezoneKeyboard() });
    return true;
  }

  const row = await ensureReminderSettings(env.DB, telegramId);
  const step = row.setup_step;

  if (step === 'morning') {
    const minute = parseHhMm(text);
    if (minute == null) {
      await sendText(env, chatId, 'Выбери время кнопкой или напиши ЧЧ:ММ (например 08:30).', {
        reply_markup: morningTimeKeyboard(),
      });
      return true;
    }
    await updateReminderSettings(env.DB, telegramId, {
      morningMinuteLocal: minute,
      setupStep: null,
    });
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (step === 'evening') {
    const minute = parseHhMm(text);
    if (minute == null) {
      await sendText(env, chatId, 'Выбери время кнопкой или напиши ЧЧ:ММ (например 21:30).', {
        reply_markup: eveningTimeKeyboard(),
      });
      return true;
    }
    await updateReminderSettings(env.DB, telegramId, {
      eveningMinuteLocal: minute,
      setupStep: null,
    });
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (step === 'timezone') {
    if (text === '✏️ Другой пояс') {
      await setReminderSetupStep(env.DB, telegramId, 'timezone_custom');
      await sendText(env, chatId, TIMEZONE_CUSTOM_HINT, {
        reply_markup: timezoneCustomKeyboard(),
      });
      return true;
    }
    const offset = TIMEZONE_PRESETS[text];
    if (offset == null) {
      await sendText(env, chatId, TIMEZONE_PICK_HINT, {
        reply_markup: timezoneKeyboard(),
      });
      return true;
    }
    await updateReminderSettings(env.DB, telegramId, {
      tzOffsetMinutes: offset,
      setupStep: null,
    });
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (step === 'timezone_custom') {
    if (text === '✏️ Другой пояс') {
      await sendText(env, chatId, TIMEZONE_CUSTOM_HINT, {
        reply_markup: timezoneCustomKeyboard(),
      });
      return true;
    }
    const offset = parseUtcOffset(text);
    if (offset == null) {
      await sendText(
        env,
        chatId,
        'Не понял формат. Напиши, например: +3  или  -4  или  UTC+5:30\n\n' + TIMEZONE_CUSTOM_HINT,
        { reply_markup: timezoneCustomKeyboard() },
      );
      return true;
    }
    await updateReminderSettings(env.DB, telegramId, {
      tzOffsetMinutes: offset,
      setupStep: null,
    });
    await showMenu(env, chatId, telegramId);
    return true;
  }

  if (text === '✅ Включить') {
    const fresh = await updateReminderSettings(env.DB, telegramId, {
      enabled: true,
      setupStep: null,
    });
    await sendText(
      env,
      chatId,
      'Напоминания включены. Буду писать утром и вечером в выбранное время.\n\n' + statusText(fresh),
      { reply_markup: remindersMenuKeyboard() },
    );
    return true;
  }

  if (text === '⏸ Выключить') {
    await updateReminderSettings(env.DB, telegramId, { enabled: false, setupStep: null });
    await sendText(env, chatId, 'Напоминания выключены.', {
      reply_markup: remindersMenuKeyboard(),
    });
    return true;
  }

  if (text === '🌅 Утро') {
    await setReminderSetupStep(env.DB, telegramId, 'morning');
    await sendText(env, chatId, 'Во сколько напоминать утром?', {
      reply_markup: morningTimeKeyboard(),
    });
    return true;
  }

  if (text === '🌙 Вечер') {
    await setReminderSetupStep(env.DB, telegramId, 'evening');
    await sendText(env, chatId, 'Во сколько напоминать вечером?', {
      reply_markup: eveningTimeKeyboard(),
    });
    return true;
  }

  if (text === '🌐 Часовой пояс') {
    await setReminderSetupStep(env.DB, telegramId, 'timezone');
    await sendText(env, chatId, TIMEZONE_PICK_HINT, {
      reply_markup: timezoneKeyboard(),
    });
    return true;
  }

  if (text === '✏️ Другой пояс') {
    await setReminderSetupStep(env.DB, telegramId, 'timezone_custom');
    await sendText(env, chatId, TIMEZONE_CUSTOM_HINT, {
      reply_markup: timezoneCustomKeyboard(),
    });
    return true;
  }

  // Has setup_step but unrecognized text — nudge
  if (step) {
    await sendText(env, chatId, 'Продолжи настройку кнопками ниже или нажми «Назад к напоминаниям».');
    return true;
  }

  return false;
}

/** Clear wizard state so /start and other commands stay clean. */
export async function clearReminderWizard(env: Env, telegramId: string): Promise<void> {
  const row = await getReminderSettings(env.DB, telegramId);
  if (row?.setup_step) await setReminderSetupStep(env.DB, telegramId, null);
}
