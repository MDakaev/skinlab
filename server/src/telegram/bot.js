/**
 * Telegram Bot API клиент (fetch). Без telegraf/grammy.
 * Token только из env — никогда не отдавать клиенту.
 */

import { getBotToken, telegramConfigured } from './auth.js';
import {
  handleUpdate,
  webAppUrl,
  startMessage,
  openAppKeyboard,
  replyKeyboard,
  BOT_COMMANDS,
  botDescription,
  botShortDescription,
  menuButton,
} from './commands.js';

const API = 'https://api.telegram.org';

async function callBot(method, body) {
  const token = getBotToken();
  if (!token) throw new Error('bot_token_missing');
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const desc = data.description || res.statusText || 'telegram_api_error';
    const err = new Error(desc);
    err.code = data.error_code;
    throw err;
  }
  return data.result;
}

export async function sendStart(chatId, firstName = '') {
  return callBot('sendMessage', {
    chat_id: chatId,
    text: startMessage(firstName),
    reply_markup: replyKeyboard(),
  });
}

export async function processUpdate(update) {
  const action = handleUpdate(update);
  if (!action) return { ok: true, handled: false };
  await callBot(action.method, action.body);
  return { ok: true, handled: true };
}

/**
 * Разово настраивает бота: команды, описания, Menu Button.
 * Запуск: npm run bot:configure
 */
export async function configureBot() {
  const results = {};
  results.commands = await callBot('setMyCommands', { commands: BOT_COMMANDS });
  results.description = await callBot('setMyDescription', { description: botDescription() });
  results.shortDescription = await callBot('setMyShortDescription', {
    short_description: botShortDescription(),
  });
  results.menuButton = await callBot('setChatMenuButton', { menu_button: menuButton() });
  try {
    results.name = await callBot('setMyName', { name: 'SkinLab 🌿' });
  } catch {
    results.name = 'skipped';
  }
  return { ok: true, webAppUrl: webAppUrl(), results };
}

export function botStatus() {
  return {
    configured: telegramConfigured(),
    webAppUrl: webAppUrl(),
  };
}

export { callBot, openAppKeyboard };
