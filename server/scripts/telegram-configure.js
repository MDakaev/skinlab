#!/usr/bin/env node
/**
 * Разовая настройка бота через Bot API:
 * команды, описание, Menu Button → Mini App.
 *
 *   npm run bot:configure
 *
 * Нужен TELEGRAM_BOT_TOKEN в .env
 */
import '../src/loadEnv.js';
import { configureBot } from '../src/telegram/bot.js';
import { telegramConfigured } from '../src/telegram/auth.js';

if (!telegramConfigured()) {
  console.error('Нет TELEGRAM_BOT_TOKEN в .env');
  process.exit(1);
}

try {
  const result = await configureBot();
  console.log('Бот настроен:');
  console.log(`  Mini App URL: ${result.webAppUrl}`);
  console.log(`  setMyCommands: ${result.results.commands}`);
  console.log(`  setMyDescription: ${result.results.description}`);
  console.log(`  setMyShortDescription: ${result.results.shortDescription}`);
  console.log(`  setChatMenuButton: ${result.results.menuButton}`);
  console.log(`  setMyName: ${result.results.name}`);
  console.log('\nПроверьте бота в Telegram: /start и кнопка меню.');
} catch (err) {
  console.error('Не удалось настроить бота:', err.message);
  process.exit(1);
}
