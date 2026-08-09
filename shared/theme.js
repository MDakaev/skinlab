/**
 * Светлая и тёмная тема.
 *
 * Настройка хранится в профиле ('auto' | 'light' | 'dark'), а в разметку
 * попадает уже вычисленное значение: <html data-theme="light|dark">.
 * Благодаря этому CSS содержит один блок переопределений, а не дубль
 * правил под prefers-color-scheme.
 */

export const THEME_OPTIONS = [
  { id: 'auto', label: 'Системная', icon: 'auto' },
  { id: 'light', label: 'Светлая', icon: 'sun' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
];

/** Цвет системной строки браузера под каждую тему. */
const META_COLOR = { light: '#cfe3f2', dark: '#0e1b28' };

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return media().matches ? 'dark' : 'light';
}

/** Проставляет тему в документ. Возвращает то, что реально применилось. */
export function applyTheme(pref = 'auto') {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[resolved]);

  return resolved;
}

/** Пока выбран режим «как в системе», следим за переключением темы в ОС. */
export function watchSystemTheme(getPref, onChange) {
  const mq = media();
  const handler = () => {
    if (getPref() !== 'auto') return;
    onChange(applyTheme('auto'));
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/** Следующий режим по кругу — для кнопки-переключателя в шапке. */
export function nextTheme(pref) {
  const order = THEME_OPTIONS.map((t) => t.id);
  return order[(order.indexOf(pref) + 1) % order.length] || 'auto';
}
