#!/usr/bin/env node
/**
 * Long polling для локальной/простой работы бота без публичного webhook.
 *
 *   npm run bot
 *
 * Отвечает на /start /help /tip /about и кнопки клавиатуры.
 * Нужен TELEGRAM_BOT_TOKEN в .env
 *
 * Не запускайте одновременно с активным webhook — Telegram отдаёт апдейты одному потребителю.
 */
import '../src/loadEnv.js';
import { callBot, processUpdate } from '../src/telegram/bot.js';
import { telegramConfigured } from '../src/telegram/auth.js';

if (process.env.NODE_ENV === 'production') {
  console.error(
    'Polling отключён при NODE_ENV=production. Используйте webhook: POST /api/telegram/webhook?secret=…',
  );
  process.exit(1);
}

if (!telegramConfigured()) {
  console.error('Нет TELEGRAM_BOT_TOKEN в .env');
  process.exit(1);
}

let offset = 0;
let stopping = false;

async function tick() {
  const updates = await callBot('getUpdates', {
    offset,
    timeout: 25,
    allowed_updates: ['message'],
  });

  for (const update of updates || []) {
    offset = update.update_id + 1;
    try {
      const result = await processUpdate(update);
      const chat = update.message?.chat?.id;
      const text = update.message?.text;
      console.log(
        `[update ${update.update_id}] chat=${chat ?? '—'} handled=${result.handled} text=${JSON.stringify(text || '')}`
      );
    } catch (err) {
      console.warn(`[update ${update.update_id}] error:`, err.message);
    }
  }
}

console.log('SkinLab bot polling… Ctrl+C чтобы остановить');
console.log('Напишите боту /start в Telegram');

process.on('SIGINT', () => {
  stopping = true;
  console.log('\nОстановка…');
  process.exit(0);
});

while (!stopping) {
  try {
    await tick();
  } catch (err) {
    console.warn('getUpdates error:', err.message);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
