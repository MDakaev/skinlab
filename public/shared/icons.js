/**
 * Единые иконки: SVG-глифы одного рисунка (штрих 1.75, скруглённые концы).
 * Активы получают цветной бейдж, интерфейсные иконки — просто глиф.
 * Эмодзи остаются в данных как запасной вариант, в UI — эти иконки.
 */

const GLYPHS = {
  retinol: `<path d="M12 3c-2.2 4.5-6 6.8-6 11a6 6 0 0 0 12 0c0-4.2-3.8-6.5-6-11Z"/><path d="M12 14.5v3.5"/>`,
  retinal: `<path d="M12 4c-1.8 3.6-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-3.2-5.4-5-9Z"/><circle cx="12" cy="14" r="1.2"/>`,
  adapalene: `<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12h6M12 9v6"/>`,
  bakuchiol: `<path d="M12 20V9"/><path d="M12 9c-3-1-5-3.5-5-6 3 .5 5 2.5 5 6Z"/><path d="M12 9c3-1 5-3.5 5-6-3 .5-5 2.5-5 6Z"/>`,
  vitc: `<circle cx="12" cy="12" r="7"/><path d="M9.5 10.5c.8-1.2 2.2-1.8 3.5-1 1.4.8 1.6 2.5.5 3.6L12 15"/>`,
  'vitc-derivative': `<circle cx="12" cy="12" r="7"/><path d="M9 14.5c1-2.5 2.5-4 5-5"/>`,
  niacinamide: `<circle cx="8" cy="10" r="3"/><circle cx="16" cy="10" r="3"/><circle cx="12" cy="16" r="3"/>`,
  azelaic: `<path d="M6 16c2-6 4-10 6-10s4 4 6 10"/><path d="M8 16h8"/>`,
  aha: `<path d="M7 17 12 5l5 12"/><path d="M9 12h6"/>`,
  bha: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2.5 2.5"/>`,
  pha: `<path d="M8 16c0-4 2-8 4-8s4 4 4 8"/><path d="M6 16h12"/>`,
  bp: `<path d="M12 4v4"/><path d="M8 8h8l-1.2 10.5a2 2 0 0 1-2 1.5h-1.6a2 2 0 0 1-2-1.5L8 8Z"/><path d="M10 12h4"/>`,
  tranexamic: `<path d="M7 7h10v10H7z"/><path d="M10 12h4M12 10v4"/>`,
  arbutin: `<circle cx="12" cy="9" r="4"/><path d="M8 13c0 3 1.5 6 4 7 2.5-1 4-4 4-7"/>`,
  ha: `<path d="M7 12c0-4 2.2-7 5-7s5 3 5 7-2.2 7-5 7-5-3-5-7Z"/><path d="M9.5 12h5"/>`,
  moisturizer: `<rect x="5.2" y="8.4" width="13.6" height="11.4" rx="3.2"/><path d="M8.4 8.4V6.6a2.4 2.4 0 0 1 2.4-2.4h2.4a2.4 2.4 0 0 1 2.4 2.4v1.8"/><path d="M9.6 14.4c1.6-1.2 3.2-1.2 4.8 0"/>`,
  ceramides: `<path d="M5 15h14"/><path d="M7 15V9l5-4 5 4v6"/><path d="M10 15v-3h4v3"/>`,
  peptides: `<circle cx="7" cy="12" r="2.5"/><circle cx="12" cy="8" r="2.5"/><circle cx="17" cy="12" r="2.5"/><circle cx="12" cy="16" r="2.5"/><path d="M9 11l1.5-1.5M15 11l-1.5-1.5M9 13l1.5 1.5M15 13l-1.5 1.5"/>`,
  panthenol: `<path d="M8 18c0-5 2-9 4-9s4 4 4 9"/><path d="M6 18h12"/><path d="M12 5v4"/>`,
  cica: `<path d="M12 20V10"/><path d="M7 12c2-1 3.5-3 5-7 1.5 4 3 6 5 7"/><path d="M9 15c1.5-.5 2.5-1.5 3-3 .5 1.5 1.5 2.5 3 3"/>`,
  urea: `<rect x="7" y="4" width="10" height="16" rx="3"/><path d="M10 9h4M10 13h4"/>`,
  zinc: `<path d="M7 7h10v3L10 17h7"/><path d="M7 17h3"/>`,
  spf: `<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/>`,
  squalane: `<path d="M5 14c3-6 5-8 7-8s4 2 7 8"/><path d="M5 14c2 3 4 5 7 5s5-2 7-5"/>`,
  vite: `<path d="M8 6h8l-1 6H9L8 6Z"/><path d="M10 12h4l-.5 6h-3L10 12Z"/>`,
};

/** Цвет бейджа по группе — чтобы иконки читались быстрее, чем эмодзи. */
const GROUP_TONE = {
  Ретиноиды: 'night',
  'Растительные аналоги': 'good',
  Антиоксиданты: 'day',
  Витамины: 'day',
  Кислоты: 'warn',
  Антибактериальные: 'warn',
  Осветляющие: 'soft',
  Увлажнители: 'ok',
  'Базовый уход': 'ok',
  Барьерные: 'good',
  'Анти-эйдж': 'night',
  Успокаивающие: 'good',
  Себорегуляция: 'ok',
  Защита: 'day',
  Эмоленты: 'ok',
};

function toneFor(active) {
  if (GROUP_TONE[active.group]) return GROUP_TONE[active.group];
  const g = (active.group || '').toLowerCase();
  if (g.includes('ретино')) return 'night';
  if (g.includes('кислот') || g.includes('отшелуш')) return 'warn';
  if (g.includes('антиокси') || g.includes('витамин')) return 'day';
  if (g.includes('барьер') || g.includes('успок') || g.includes('восстанов')) return 'good';
  if (g.includes('увлаж') || g.includes('гиалурон')) return 'ok';
  if (g.includes('солнц') || g.includes('spf')) return 'day';
  if (g.includes('осветл') || g.includes('пигмент')) return 'soft';
  return 'neutral';
}

function glyph(id) {
  const paths = GLYPHS[id] || `<circle cx="12" cy="12" r="5"/><path d="M12 8v8M8 12h8"/>`;
  return `<svg class="sl-ico__svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/**
 * Иконка актива.
 * @param {object} active
 * @param {'sm'|'md'|'lg'} [size]
 */
export function activeIcon(active, size = 'md') {
  if (!active) return '';
  const tone = toneFor(active);
  return `<span class="sl-ico sl-ico--${size} sl-ico--${tone}" title="${escapeAttr(active.name)}" aria-hidden="true">${glyph(active.id)}</span>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Интерфейсные иконки ---------- */

/** Разделы, служебные элементы, задачи кожи и типы кожи — одним набором. */
const UI_GLYPHS = {
  // разделы
  pairs: `<circle cx="9.2" cy="12" r="5.2"/><circle cx="14.8" cy="12" r="5.2"/>`,
  plan: `<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3.4"/><path d="M3.6 10.2h16.8"/><path d="M8.2 3.2v4M15.8 3.2v4"/><path d="M8.4 14h2.2M13.4 14h2.2M8.4 17.4h2.2M13.4 17.4h2.2"/>`,
  catalog: `<path d="M12 7.9C10.5 6.4 8.6 5.6 6 5.6H3.8v12h2.2c2.6 0 4.5.8 6 2.4 1.5-1.6 3.4-2.4 6-2.4h2.2v-12H18c-2.6 0-4.5.8-6 2.3Z"/><path d="M12 7.9V20"/>`,
  me: `<circle cx="12" cy="8.6" r="3.7"/><path d="M4.9 19.9c1.3-3.5 4-5.3 7.1-5.3s5.8 1.8 7.1 5.3"/>`,

  // служебные
  sun: `<circle cx="12" cy="12" r="3.9"/><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.9 5.9 7.4 7.4M16.6 16.6l1.5 1.5M5.9 18.1l1.5-1.5M16.6 7.4l1.5-1.5"/>`,
  moon: `<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z"/>`,
  search: `<circle cx="10.8" cy="10.8" r="6.2"/><path d="m19.4 19.4-4.2-4.2"/>`,
  close: `<path d="m6.8 6.8 10.4 10.4M17.2 6.8 6.8 17.2"/>`,
  bottle: `<path d="M9.8 3.2h4.4v3.1l2.3 2.6a4 4 0 0 1 1 2.7v6.6a3 3 0 0 1-3 3H9.5a3 3 0 0 1-3-3v-6.6a4 4 0 0 1 1-2.7l2.3-2.6V3.2Z"/><path d="M7 13.2h10"/>`,
  sparkle: `<path d="m11.4 3.6 1.7 4.7 4.7 1.7-4.7 1.7-1.7 4.7-1.7-4.7L5 10l4.7-1.7 1.7-4.7Z"/><path d="m18 15.4.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"/>`,
  leaf: `<path d="M4.8 19.4c0-7.6 5.1-12.1 15.1-12.6.5 7.6-4.5 12.6-12.1 12.6H4.8Z"/><path d="M4.8 19.4c3.2-4.6 6.9-7.1 10.6-8.3"/>`,
  drop: `<path d="M12 3.8c-3.2 4.2-5.2 6.5-5.2 9.3a5.2 5.2 0 0 0 10.4 0c0-2.8-2-5.1-5.2-9.3Z"/>`,
  cream: `<rect x="5.2" y="8.4" width="13.6" height="11.4" rx="3.2"/><path d="M8.4 8.4V6.6a2.4 2.4 0 0 1 2.4-2.4h2.4a2.4 2.4 0 0 1 2.4 2.4v1.8"/><path d="M9.6 14.4c1.6-1.2 3.2-1.2 4.8 0"/>`,
  cleanse: `<path d="M4.6 11.6h14.8"/><path d="M6.2 11.6c0 4.4 2.6 7.8 5.8 7.8s5.8-3.4 5.8-7.8"/><path d="M9.4 8.4c0-1.5 1.3-2.1 1.3-3.6M14.2 8.4c0-1.5 1.3-2.1 1.3-3.6"/>`,
  auto: `<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none"/>`,

  // задачи кожи
  acne: `<circle cx="12" cy="12" r="7.1"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2"/>`,
  pigmentation: `<circle cx="9.6" cy="9.8" r="3.1"/><circle cx="15.7" cy="14.7" r="2.2"/><circle cx="15.9" cy="8.1" r="1.2"/><circle cx="9" cy="16.5" r="1"/>`,
  wrinkles: `<path d="M4 8.4c2.7-2 5.3 2 8 0s5.3-2 8 0"/><path d="M4 13c2.7-2 5.3 2 8 0s5.3-2 8 0"/><path d="M4 17.6c2.7-2 5.3 2 8 0s5.3-2 8 0"/>`,
  pores: `<circle cx="12" cy="12" r="7.8"/><circle cx="9.4" cy="10" r="1.1"/><circle cx="14.4" cy="9.4" r="1.1"/><circle cx="11" cy="14.6" r="1.1"/><circle cx="15.2" cy="14" r="1.1"/>`,
  redness: `<path d="M8.4 20.6c-1.2-2 1-3.2 0-5.2s1-3.2 0-5.2 1-3.2 0-5.6"/><path d="M15.6 20.6c-1.2-2 1-3.2 0-5.2s1-3.2 0-5.2 1-3.2 0-5.6"/>`,
  dehydration: `<path d="M12 3.8c-3.2 4.2-5.2 6.5-5.2 9.3a5.2 5.2 0 0 0 10.4 0c0-2.8-2-5.1-5.2-9.3Z" stroke-dasharray="3 2.6"/>`,
  texture: `<path d="M4 7.6h7.6M14.4 7.6h5.6M4 12h4.8M11.6 12h8.4M4 16.4h10.4M17.2 16.4h2.8"/>`,
  dullness: `<path d="m11.4 3.6 1.7 4.7 4.7 1.7-4.7 1.7-1.7 4.7-1.7-4.7L5 10l4.7-1.7 1.7-4.7Z"/><path d="m18 15.4.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"/>`,
  barrier: `<path d="M12 3.4 5.6 5.9v6c0 4.1 2.6 7 6.4 8.7 3.8-1.7 6.4-4.6 6.4-8.7v-6L12 3.4Z"/><path d="m9.4 12.2 1.9 2 3.3-3.7"/>`,

  // типы кожи
  dry: `<circle cx="12" cy="10.2" r="3.3"/><path d="M12 3.6v1.6M18.9 10.2h-1.6M6.7 10.2H5.1M16.7 5.5l-1.1 1.1M8.4 6.6 7.3 5.5"/><path d="M4.6 17.2h14.8"/><path d="m8.2 20.8 1-3.6M12.6 20.8l-.6-3.6M16.4 20.8l-1-3.6"/>`,
  oily: `<path d="M12 3.8c-3.2 4.2-5.2 6.5-5.2 9.3a5.2 5.2 0 0 0 10.4 0c0-2.8-2-5.1-5.2-9.3Z"/><path d="M9.6 13.6c.3 1.7 1.4 2.8 3 3.1"/>`,
  combo: `<circle cx="12" cy="12" r="7.6"/><path d="M12 4.4v15.2"/><path d="M14.8 8.6h3.4M14.8 12h4.6M14.8 15.4h3.4"/>`,
  normal: `<path d="M4.8 19.4c0-7.6 5.1-12.1 15.1-12.6.5 7.6-4.5 12.6-12.1 12.6H4.8Z"/><path d="M4.8 19.4c3.2-4.6 6.9-7.1 10.6-8.3"/>`,
  sensitive: `<path d="M18.9 5.1c.7 6.5-3.7 11.1-9.9 11.1H6.3c0-4.7 3.4-9.7 12.6-11.1Z"/><path d="M4.8 19.8 9 15.6"/><path d="M12.6 8.7c-1.7 1.4-2.9 3.3-3.5 5.4"/>`,
};

const UI_SIZE = { xs: 14, sm: 16, md: 20, lg: 24, xl: 40 };

/**
 * Интерфейсная иконка тем же штрихом, что и иконки активов.
 * @param {keyof UI_GLYPHS} name
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [size]
 */
export function uiIcon(name, size = 'md') {
  const paths = UI_GLYPHS[name];
  if (!paths) return '';
  const px = UI_SIZE[size] || UI_SIZE.md;
  return `<svg class="sl-uico" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** Легенда групп — для подсказки «что означают цвета». */
export const ICON_LEGEND = [
  { tone: 'night', label: 'Ретиноиды' },
  { tone: 'day', label: 'Антиоксиданты и SPF' },
  { tone: 'warn', label: 'Кислоты' },
  { tone: 'ok', label: 'Увлажнение' },
  { tone: 'good', label: 'Барьер и успокоение' },
  { tone: 'soft', label: 'Осветление' },
];
