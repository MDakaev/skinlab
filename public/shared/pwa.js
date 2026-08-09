/** Регистрация service worker и кнопка «Установить приложение». */

let deferredPrompt = null;

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* офлайн-режим просто не включится */
    });
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Показывает кнопку установки, когда браузер к этому готов.
 * В Safari на iOS события нет — показываем инструкцию «Поделиться → На экран Домой».
 */
export function setupInstall(button, { onHint } = {}) {
  if (!button) return;
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
