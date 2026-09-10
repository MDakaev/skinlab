/**
 * Telegram Bot API клиент (fetch). Без telegraf/grammy.
 * Token только из env — никогда не отдавать клиенту.
 *
 * Исходящий доступ к api.telegram.org можно завернуть в прокси
 * (только Bot API, ЮKassa и остальное не затрагиваются):
 *   TELEGRAM_PROXY_URL=http://127.0.0.1:8080
 *   TELEGRAM_PROXY_URL=socks5://127.0.0.1:1080
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici';
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

/** @type {Promise<import('undici').Dispatcher | undefined> | null} */
let dispatcherPromise = null;

async function telegramDispatcher() {
  const raw = process.env.TELEGRAM_PROXY_URL?.trim();
  if (!raw) return undefined;
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new Error('telegram_proxy_invalid_url');
      }
      const proto = parsed.protocol.replace(/:$/, '').toLowerCase();
      if (proto === 'socks' || proto === 'socks5' || proto === 'socks5h') {
        const { socksDispatcher } = await import('fetch-socks');
        return socksDispatcher({
          type: 5,
          host: parsed.hostname,
          port: Number(parsed.port || 1080),
          userId: parsed.username ? decodeURIComponent(parsed.username) : undefined,
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        });
      }
      if (proto === 'http' || proto === 'https') {
        return new ProxyAgent(raw);
      }
      throw new Error(`telegram_proxy_unsupported_scheme:${proto}`);
    })();
  }
  return dispatcherPromise;
}

async function callBot(method, body) {
  const token = getBotToken();
  if (!token) throw new Error('bot_token_missing');
  const dispatcher = await telegramDispatcher();
  const res = await undiciFetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    ...(dispatcher ? { dispatcher } : {}),
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
