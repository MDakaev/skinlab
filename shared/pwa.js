/** Регистрация service worker и кнопка «Установить приложение». */

import { isTelegramApp } from './telegram.js';

let deferredPrompt = null;

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // В Telegram Mini App SW не нужен и может мешать свежим обновлениям WebView.
  if (isTelegramApp()) return;
  window.addEventListener('load', () => {
    // Относительно shared/pwa.js → корень сайта (и /local, и /skinlab/).
    const swUrl = new URL('../sw.js', import.meta.url);
    const scope = new URL('../', import.meta.url);
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {
      /* офлайн-режим просто не включится */
    });
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Показывает кнопку установки, когда браузер к этому готов.
 * В Safari на iOS события нет — показываем инструкцию «Поделиться → На экран Домой».
 * В Telegram скрываем.
 */
export function setupInstall(button, { onHint } = {}) {
  if (!button) return;
  if (isTelegramApp()) {
    button.hidden = true;
    return;
  }
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isStandalone()) {
    button.hidden = true;
    return;
  }

  if (iOS) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const hint = 'В Safari нажмите «Поделиться», затем «На экран „Домой“».';
      onHint ? onHint(hint) : alert(hint);
    });
    return;
  }

  button.hidden = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    button.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    button.hidden = true;
  });
}
