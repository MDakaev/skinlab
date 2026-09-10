/**
 * Minimal Telegram Bot API client (fetch).
 * Only methods SkinLab needs — no telegraf/grammy.
 */

const API = 'https://api.telegram.org';

export async function callTelegram<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: T };
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `telegram_${method}_failed`);
  }
  return data.result as T;
}

export function replyKeyboard() {
  return {
    keyboard: [
      [{ text: '🌿 Открыть SkinLab' }],
      [{ text: '💡 Совет' }, { text: 'ℹ️ Инфо' }],
      [{ text: '⏰ Напоминания' }, { text: '💬 Поддержка' }],
      [{ text: '📄 Соглашение' }, { text: '🔒 Конфиденциальность' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function remindersMenuKeyboard() {
  return {
    keyboard: [
      [{ text: '✅ Включить' }, { text: '⏸ Выключить' }],
      [{ text: '🌅 Утро' }, { text: '🌙 Вечер' }],
      [{ text: '🌐 Часовой пояс' }],
      [{ text: '« Назад' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function morningTimeKeyboard() {
  return {
    keyboard: [
      [{ text: '07:00' }, { text: '08:00' }, { text: '09:00' }],
      [{ text: '10:00' }, { text: '11:00' }],
      [{ text: '« Назад к напоминаниям' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function eveningTimeKeyboard() {
  return {
    keyboard: [
      [{ text: '20:00' }, { text: '21:00' }, { text: '22:00' }],
      [{ text: '23:00' }, { text: '00:00' }],
      [{ text: '« Назад к напоминаниям' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function timezoneKeyboard() {
  return {
    keyboard: [
      [{ text: 'Калининград UTC+2' }, { text: 'Москва UTC+3' }],
      [{ text: 'Самара UTC+4' }, { text: 'Екатеринбург UTC+5' }],
      [{ text: 'Новосибирск UTC+7' }, { text: 'Владивосток UTC+10' }],
      [{ text: '✏️ Другой пояс' }],
      [{ text: '« Назад к напоминаниям' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function timezoneCustomKeyboard() {
  return {
    keyboard: [[{ text: '« Назад к выбору пояса' }], [{ text: '« Назад к напоминаниям' }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Label → fixed offset east of UTC (minutes). */
export const TIMEZONE_PRESETS: Record<string, number> = {
  'Калининград UTC+2': 120,
  'Москва UTC+3': 180,
  'Самара UTC+4': 240,
  'Екатеринбург UTC+5': 300,
  'Новосибирск UTC+7': 420,
  'Владивосток UTC+10': 600,
};

export const TIMEZONE_PICK_HINT =
  'Выбери город кнопкой или нажми «Другой пояс», если твоего нет в списке.';

export const TIMEZONE_CUSTOM_HINT =
  'Напиши смещение от UTC одним сообщением.\n\n' +
  'Примеры: +3  −4  +5:30  UTC-5  UTC+9:30\n' +
  'Диапазон: от UTC−12 до UTC+14 (минуты: 00, 15, 30 или 45).\n\n' +
  'Не знаешь свой пояс? В Google: «Париж UTC» или «Buenos Aires UTC» — в ответе будет UTC±N.';

export function reminderStatusMessage(input: {
  enabled: boolean;
  morning: string;
  evening: string;
  offsetLabel: string;
}): string {
  const state = input.enabled ? 'включены' : 'выключены';
  return (
    `⏰ Напоминания: ${state}\n` +
    `🌅 Утро: ${input.morning}\n` +
    `🌙 Вечер: ${input.evening}\n` +
    `🌐 Пояс: ${input.offsetLabel}\n\n` +
    `Выбери действие кнопками ниже.`
  );
}

export function webAppKeyboard(appUrl: string) {
  return {
    inline_keyboard: [[{ text: 'Открыть SkinLab', web_app: { url: appUrl } }]],
  };
}

/** Always-available legal + support links for bank / users. */
export function legalInlineKeyboard(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, '');
  return {
    inline_keyboard: [
      [
        { text: '📄 Соглашение', url: `${root}/legal/offer.html` },
        { text: '🔒 Конфиденциальность', url: `${root}/legal/privacy.html` },
      ],
      [{ text: 'Открыть SkinLab', web_app: { url: `${root}/` } }],
    ],
  };
}

export function startMessage(firstName?: string): string {
  const name = firstName?.trim() ? `, ${firstName.trim()}` : '';
  return (
    `Привет${name}! Я SkinLab — помощник по уходу за кожей.\n\n` +
    `Открой приложение кнопкой ниже или меню бота — там подсказки по уходу.\n\n` +
    `Документы и тарифы всегда доступны кнопками «Соглашение» и «Конфиденциальность».\n` +
    `Справка: /help`
  );
}

export function tipMessage(): string {
  const tips = [
    'Наносите активы на слегка влажную кожу — проникновение обычно лучше.',
    'Кислоты и ретиноиды лучше не смешивать в один вечер, если кожа чувствительная.',
    'SPF днём важнее любого «антиэйджа»: без защиты прогресс сбрасывается.',
    'Если жжёт сильнее обычного — снизьте частоту, не терпите «через боль».',
    'Патч-тест нового средства: внутренний сгиб локтя, 24 часа.',
  ];
  return `💡 ${tips[Math.floor(Math.random() * tips.length)]}\n\nЭто справочный совет, не замена консультации врача.`;
}

export function supportMessage(username?: string, email?: string): string {
  const lines = ['Поддержка SkinLab:'];
  if (email?.trim()) lines.push(`Email: ${email.trim()}`);
  if (username?.trim()) lines.push(`Telegram: @${username.replace(/^@/, '')}`);
  if (lines.length === 1) {
    return 'Напиши сюда свой вопрос — ответим вручную, или укажи SUPPORT_EMAIL / SUPPORT_USERNAME в настройках.';
  }
  lines.push('', 'Обычно отвечаем в рабочее время.');
  return lines.join('\n');
}

export function infoMessage(supportUsername?: string, supportEmail?: string): string {
  const support = supportMessage(supportUsername, supportEmail);
  return (
    `ℹ️ SkinLab — справочник по уходу за кожей в Telegram Mini App.\n\n` +
    `Подписка открывает полный помощник. Тарифы: 290 ₽ / мес, 690 ₽ за 3 мес (230 ₽/мес), ` +
    `1 190 ₽ за 6 мес (198 ₽/мес), 1 990 ₽ за 12 мес (166 ₽/мес). Пробный период — 3 дня.\n\n` +
    `Документы: кнопки «Соглашение» и «Конфиденциальность» или команды /terms и /privacy.\n\n` +
    `Информация носит справочный характер и не заменяет консультацию дерматолога.\n\n` +
    support
  );
}

export function agreementMessage(baseUrl: string): string {
  const url = `${baseUrl.replace(/\/$/, '')}/legal/offer.html`;
  return (
    `📄 Пользовательское соглашение SkinLab (тарифы, оплата, возвраты):\n${url}\n\n` +
    `Кратко по ценам:\n` +
    `• 1 мес — 290 ₽ (290 ₽/мес)\n` +
    `• 3 мес — 690 ₽ (230 ₽/мес)\n` +
    `• 6 мес — 1 190 ₽ (198 ₽/мес)\n` +
    `• 12 мес — 1 990 ₽ (166 ₽/мес)\n` +
    `Новым пользователям — 3 дня бесплатно.`
  );
}

export function privacyMessage(baseUrl: string): string {
  const url = `${baseUrl.replace(/\/$/, '')}/legal/privacy.html`;
  return `🔒 Политика конфиденциальности SkinLab:\n${url}`;
}
