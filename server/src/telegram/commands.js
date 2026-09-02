/**
 * Тексты, команды и клавиатуры бота SkinLab 🌿
 * Без тяжёлого bot framework — только данные для Bot API.
 */

export function webAppUrl() {
  return (
    process.env.TELEGRAM_WEBAPP_URL ||
    process.env.SKINLAB_WEBAPP_URL ||
    'https://mdakaev.github.io/skinlab/'
  );
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Открыть SkinLab и короткое знакомство' },
  { command: 'app', description: 'Кнопка: открыть Mini App' },
  { command: 'help', description: 'Как пользоваться' },
  { command: 'tip', description: 'Совет по сочетаниям активов' },
  { command: 'about', description: 'О приложении и дисклеймер' },
];

export function botDescription() {
  return [
    'SkinLab — справочник сочетаний уход-активов.',
    'Проверьте, что можно наносить вместе, а что лучше развести по дням.',
    'Соберите персональную рутину и недельный план.',
    '',
    'Информация справочная и не заменяет консультацию дерматолога.',
  ].join('\n');
}

export function botShortDescription() {
  return 'Что с чем сочетать в уходе за кожей — Mini App SkinLab';
}

/** Меню-кнопка слева от поля ввода (то же, что настраивают в BotFather). */
export function menuButton() {
  return {
    type: 'web_app',
    text: '🌿 Открыть SkinLab',
    web_app: { url: webAppUrl() },
  };
}

export function openAppKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🌿 Открыть SkinLab', web_app: { url: webAppUrl() } }],
    ],
  };
}

/** Постоянная клавиатура внизу чата. */
export function replyKeyboard() {
  return {
    keyboard: [
      [{ text: '🌿 Открыть SkinLab', web_app: { url: webAppUrl() } }],
      [{ text: '💡 Совет' }, { text: '❓ Помощь' }],
      [{ text: 'ℹ️ О SkinLab' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function startMessage(firstName = '') {
  const hi = firstName ? `, ${firstName}` : '';
  return [
    `🌿 SkinLab${hi}`,
    '',
    'Разберись, какие активы можно сочетать,',
    'а какие лучше развести по дням.',
    '',
    'Внутри приложения:',
    '• Сочетания — бесплатно',
    '• Активы — бесплатно',
    '• Идеал и Мой уход — по лицензии',
    '',
    'Нажми кнопку ниже или меню ☰ слева от поля ввода.',
  ].join('\n');
}

export function helpMessage() {
  return [
    '❓ Как пользоваться',
    '',
    '1. Открой Mini App кнопкой «🌿 Открыть SkinLab».',
    '2. В «Сочетания» выбери актив — увидишь, с чем он дружит и с чем нет.',
    '3. В «Активы» листай справочник.',
    '4. В «Профиль» укажи тип кожи и задачи — так подсказки станут личнее.',
    '5. «Идеал» и «Мой уход» собирают рутину и неделю без конфликтов (Pro).',
    '',
    'Команды: /start /app /tip /about',
  ].join('\n');
}

export function aboutMessage() {
  return [
    'ℹ️ О SkinLab',
    '',
    'Справочник собран вручную по клиническим публикациям,',
    'рекомендациям дерматологических ассоциаций и регуляторным документам.',
    'Пары без подтверждённого источника в приложение не попадают.',
    '',
    '⚠️ Информация носит справочный характер и не заменяет',
    'консультацию дерматолога или врача.',
    '',
    `Mini App: ${webAppUrl()}`,
  ].join('\n');
}

const TIPS = [
  [
    '💡 Ретинол + кислоты',
    'AHA/BHA и ретинол в один слой часто раздражают.',
    'Обычно их разносят: кислоты — в одни вечера, ретинол — в другие.',
  ].join('\n'),
  [
    '💡 Витамин C + ниацинамид',
    'Современные формы часто хорошо уживаются.',
    'Если кожа чувствительная — вводи по одному и смотри реакцию.',
  ].join('\n'),
  [
    '💡 SPF — каждый день',
    'Утром с активами (ретиноиды, кислоты, витамин C) SPF особенно важен.',
    'Без защиты дневной уход работает против себя.',
  ].join('\n'),
  [
    '💡 Ниацинамид + цинк',
    'Частая пара для жирной кожи и пор.',
    'Обычно спокойно сочетаются в одном уходе.',
  ].join('\n'),
  [
    '💡 Увлажняющий крем',
    'Крем — не «лишний» шаг: он закрывает барьер,',
    'который кислоты и ретиноиды намеренно расшатывают.',
  ].join('\n'),
  [
    '💡 Беременность',
    'Ретиноиды и некоторые кислоты в этот период обычно исключают.',
    'В SkinLab включите переключатель в профиле — покажем предупреждения.',
  ].join('\n'),
];

export function tipMessage() {
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return [
    tip,
    '',
    'Больше сочетаний — в Mini App → раздел «Сочетания».',
  ].join('\n');
}

export function appMessage() {
  return [
    '🌿 Открыть SkinLab',
    '',
    'Нажми кнопку — приложение откроется прямо в Telegram.',
  ].join('\n');
}

export function fallbackMessage() {
  return [
    'Я бот SkinLab 🌿',
    '',
    'Напиши /start или нажми кнопку ниже,',
    'чтобы открыть приложение.',
    '',
    'Ещё: /help · /tip · /about',
  ].join('\n');
}

/** @deprecated use openAppKeyboard */
export function startKeyboard() {
  return openAppKeyboard();
}

function normalizeText(text) {
  return String(text || '')
    .trim()
    .replace(/@\w+/g, '')
    .trim();
}

/**
 * @param {object} update — Telegram Update
 * @returns {{ method: string, body: object } | null}
 */
export function handleUpdate(update) {
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return null;

  const chatId = message.chat.id;
  const text = normalizeText(message.text);
  const firstName = message.from?.first_name || '';

  const send = (bodyText, extra = {}) => ({
    method: 'sendMessage',
    body: {
      chat_id: chatId,
      text: bodyText,
      reply_markup: openAppKeyboard(),
      ...extra,
    },
  });

  const lower = text.toLowerCase();

  if (text.startsWith('/start') || lower === '🌿 skinlab' || lower === 'skinlab') {
    return {
      method: 'sendMessage',
      body: {
        chat_id: chatId,
        text: startMessage(firstName),
        reply_markup: replyKeyboard(),
      },
    };
  }

  if (text.startsWith('/app') || text === '🌿 Открыть SkinLab') {
    return send(appMessage());
  }

  if (text.startsWith('/help') || text === '❓ Помощь' || lower === 'помощь') {
    return send(helpMessage());
  }

  if (text.startsWith('/tip') || text === '💡 Совет' || lower === 'совет') {
    return send(tipMessage());
  }

  if (text.startsWith('/about') || text === 'ℹ️ О SkinLab' || lower === 'о skinlab') {
    return send(aboutMessage());
  }

  // Любое другое сообщение — мягкий fallback, чтобы бот не молчал.
  if (text) {
    return {
      method: 'sendMessage',
      body: {
        chat_id: chatId,
        text: fallbackMessage(),
        reply_markup: replyKeyboard(),
      },
    };
  }

  return null;
}
