/**
 * Единственная точка доступа к Telegram WebApp SDK.
 * Вне Telegram все методы безопасны (no-op / null) — Web/PWA не ломаются.
 */

const THEME_CSS_VARS = [
  ['--tg-theme-bg-color', 'bg_color'],
  ['--tg-theme-text-color', 'text_color'],
  ['--tg-theme-hint-color', 'hint_color'],
  ['--tg-theme-link-color', 'link_color'],
  ['--tg-theme-button-color', 'button_color'],
  ['--tg-theme-button-text-color', 'button_text_color'],
  ['--tg-theme-secondary-bg-color', 'secondary_bg_color'],
  ['--tg-theme-header-bg-color', 'header_bg_color'],
  ['--tg-theme-section-bg-color', 'section_bg_color'],
  ['--tg-theme-accent-text-color', 'accent_text_color'],
  ['--tg-theme-destructive-text-color', 'destructive_text_color'],
];

let backHandler = null;
let mainHandler = null;
let viewportHandler = null;
let booted = false;

export function getTelegramWebApp() {
  try {
    const tg = window.Telegram?.WebApp;
    return tg || null;
  } catch {
    return null;
  }
}

/**
 * True, если открыто внутри Telegram Mini App.
 * Только непустой initData — platform без initData бывает и вне Mini App
 * (встроенный браузер / загруженный SDK) и ломал UI-класс is-telegram.
 */
export function isTelegramApp() {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  return Boolean(wa.initData && String(wa.initData).length > 0);
}

export function getTelegramUser() {
  if (!isTelegramApp()) return null;
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id ?? null,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    isPremium: Boolean(user.is_premium),
    photoUrl: user.photo_url || '',
  };
}

/** Сырая подписанная строка. Для auth — только на backend. Не логировать целиком. */
export function getTelegramInitData() {
  if (!isTelegramApp()) return '';
  return getTelegramWebApp()?.initData || '';
}

export function ready() {
  const wa = getTelegramWebApp();
  if (!wa || !isTelegramApp()) return false;
  try {
    wa.ready();
    return true;
  } catch {
    return false;
  }
}

export function expand() {
  const wa = getTelegramWebApp();
  if (!wa || !isTelegramApp()) return false;
  try {
    wa.expand();
    return true;
  } catch {
    return false;
  }
}

export function close() {
  const wa = getTelegramWebApp();
  if (!wa || !isTelegramApp()) return false;
  try {
    wa.close();
    return true;
  } catch {
    return false;
  }
}

export function showMainButton(text, onClick) {
  const wa = getTelegramWebApp();
  if (!wa?.MainButton || !isTelegramApp()) return false;
  try {
    if (mainHandler) wa.MainButton.offClick(mainHandler);
    mainHandler = typeof onClick === 'function' ? onClick : null;
    wa.MainButton.setText(text || 'OK');
    if (mainHandler) wa.MainButton.onClick(mainHandler);
    wa.MainButton.show();
    return true;
  } catch {
    return false;
  }
}

export function hideMainButton() {
  const wa = getTelegramWebApp();
  if (!wa?.MainButton) return false;
  try {
    if (mainHandler) {
      wa.MainButton.offClick(mainHandler);
      mainHandler = null;
    }
    wa.MainButton.hide();
    return true;
  } catch {
    return false;
  }
}

export function showBackButton(onClick) {
  const wa = getTelegramWebApp();
  if (!wa?.BackButton || !isTelegramApp()) return false;
  try {
    if (backHandler) wa.BackButton.offClick(backHandler);
    backHandler = typeof onClick === 'function' ? onClick : null;
    if (backHandler) wa.BackButton.onClick(backHandler);
    wa.BackButton.show();
    return true;
  } catch {
    return false;
  }
}

export function hideBackButton() {
  const wa = getTelegramWebApp();
  if (!wa?.BackButton) return false;
  try {
    if (backHandler) {
      wa.BackButton.offClick(backHandler);
      backHandler = null;
    }
    wa.BackButton.hide();
    return true;
  } catch {
    return false;
  }
}

function applyThemeParams(wa) {
  const root = document.documentElement;
  const params = wa?.themeParams || {};
  for (const [cssVar, key] of THEME_CSS_VARS) {
    const value = params[key];
    if (value) root.style.setProperty(cssVar, value);
    else root.style.removeProperty(cssVar);
  }
}

function applyViewport(wa) {
  const root = document.documentElement;
  const h = Number(wa?.viewportStableHeight || wa?.viewportHeight || 0);
  // Игнорируем мусорные значения — иначе .phone схлопывается и «пропадают» кнопки.
  if (Number.isFinite(h) && h >= 280) {
    root.style.setProperty('--tg-viewport-stable-height', `${Math.round(h)}px`);
  }
  const insetTop = wa?.safeAreaInset?.top ?? wa?.contentSafeAreaInset?.top;
  const insetBottom = wa?.safeAreaInset?.bottom ?? wa?.contentSafeAreaInset?.bottom;
  if (typeof insetTop === 'number') root.style.setProperty('--tg-safe-area-top', `${insetTop}px`);
  if (typeof insetBottom === 'number') root.style.setProperty('--tg-safe-area-bottom', `${insetBottom}px`);
}

/**
 * Boot Telegram shell: класс на <html>, theme vars, viewport, ready/expand.
 * Безопасно вызывать и вне Telegram.
 */
export function bootTelegram() {
  if (booted) return isTelegramApp();
  booted = true;

  const active = isTelegramApp();
  const root = document.documentElement;
  root.classList.toggle('is-telegram', active);
  root.dataset.env = active ? 'telegram' : 'web';

  if (!active) return false;

  const wa = getTelegramWebApp();
  applyThemeParams(wa);
  applyViewport(wa);
  ready();
  expand();

  try {
    wa?.setHeaderColor?.('secondary_bg_color');
    wa?.setBackgroundColor?.(wa.themeParams?.bg_color || '#f3eee4');
  } catch {
    /* optional API */
  }

  if (!viewportHandler && wa?.onEvent) {
    viewportHandler = () => {
      applyThemeParams(wa);
      applyViewport(wa);
    };
    wa.onEvent('themeChanged', viewportHandler);
    wa.onEvent('viewportChanged', viewportHandler);
  }

  return true;
}

export function isDevHost() {
  const host = location.hostname;
  return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
}

/** Диагностика только для localhost / явного ?debug=1. Без полного initData. */
export function getEnvDiagnostics() {
  const wa = getTelegramWebApp();
  const user = getTelegramUser();
  const initData = getTelegramInitData();
  return {
    environment: isTelegramApp() ? 'TELEGRAM' : 'WEB',
    sdk: wa ? 'available' : 'unavailable',
    platform: wa?.platform || null,
    version: wa?.version || null,
    user: user
      ? {
          id: user.id,
          firstName: user.firstName,
          username: user.username || null,
        }
      : null,
    initData: initData ? 'present' : 'absent',
    initDataLength: initData ? initData.length : 0,
    colorScheme: wa?.colorScheme || null,
  };
}

export function shouldShowDiagnostics() {
  if (isDevHost()) return true;
  try {
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}
