/**
 * Общие блоки контента для всех макетов.
 * Разметка семантическая и одинаковая, а внешний вид полностью задаёт тема.
 */
import {
  SKIN_TYPES,
  LEVELS,
  relationsOf,
  PREGNANCY_LABEL,
  SKIN_VERDICT,
  TIME_LABEL,
} from './engine.js';
import { activeIcon, uiIcon } from './icons.js';
import { APPLY_LAYERS, APPLY_RULES } from './guide.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export { activeIcon, uiIcon };

export const meter = (value, max = 5) =>
  `<span class="sl-meter" aria-label="${value} из ${max}">${Array.from({ length: max }, (_, i) => `<i class="sl-meter__dot${i < value ? ' is-on' : ''}"></i>`).join('')}</span>`;

export function pill(text, tone = '') {
  return `<span class="sl-pill${tone ? ` sl-pill--${tone}` : ''}">${esc(text)}</span>`;
}

/** Кнопка-подсказка: клик/фокус открывает пояснение. */
export function tipBtn(text, { label = 'Что это?' } = {}) {
  return `<button type="button" class="sl-tipbtn" data-tip-toggle aria-expanded="false" aria-label="${esc(label)}">
    <span class="sl-tipbtn__mark" aria-hidden="true">?</span>
    <span class="sl-tipbtn__pop" role="tooltip">${esc(text)}</span>
  </button>`;
}

/** Компактная карточка актива для списков и сеток. */
export function activeCard(a, { selected = false } = {}) {
  return `
    <article class="sl-card${selected ? ' is-selected' : ''}" data-active="${a.id}" tabindex="0" role="button" aria-label="${esc(a.name)}">
      ${activeIcon(a, 'md')}
      <div class="sl-card__body">
        <h3 class="sl-card__title">${esc(a.name)}</h3>
        <p class="sl-card__inci">${esc(a.inci)}</p>
        <p class="sl-card__tagline">${esc(a.tagline)}</p>
      </div>
      <div class="sl-card__meta">
        ${pill(TIME_LABEL[a.time], a.time === 'PM' ? 'night' : a.time === 'AM' ? 'day' : '')}
        ${pill(a.group)}
      </div>
    </article>`;
}

/** Общая инструкция: порядок слоёв + правила нанесения. */
export function applyGuideView() {
  return `
    <div class="sl-apply">
      <ol class="sl-apply__layers">
        ${APPLY_LAYERS.map(
          (s) => `<li class="sl-apply__layer">
            <span class="sl-apply__num">${s.step}</span>
            <div>
              <b>${esc(s.title)}</b>
              <p>${esc(s.text)}</p>
            </div>
          </li>`
        ).join('')}
      </ol>
      <div class="sl-apply__rules">
        ${APPLY_RULES.map(
          (r) => `<div class="sl-apply__rule">
            <b>${esc(r.title)}</b>
            <p>${esc(r.text)}</p>
          </div>`
        ).join('')}
      </div>
    </div>`;
}

export function productCard(p, activeNames) {
  return `
    <article class="sl-product" data-product="${p.id}">
      <div class="sl-product__head">
        <span class="sl-product__brand">${esc(p.brand)}</span>
        <span class="sl-product__type">${esc(p.type)}</span>
      </div>
      <h3 class="sl-product__name">${esc(p.name)}</h3>
      <div class="sl-product__actives">${activeNames.map((n) => `<span class="sl-tag">${esc(n)}</span>`).join('')}</div>
    </article>`;
}

const section = (title, inner, mod = '') =>
  `<section class="sl-sect${mod ? ` sl-sect--${mod}` : ''}"><h4 class="sl-sect__title">${esc(title)}</h4>${inner}</section>`;

const bullets = (items, mod = '') =>
  `<ul class="sl-list${mod ? ` sl-list--${mod}` : ''}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

/** Блок проверяемых источников. Показывается только если они заданы. */
const sourcesBlock = (sources) => {
  if (!Array.isArray(sources) || !sources.length) return '';
  const items = sources
    .filter((s) => s && s.url)
    .map(
      (s) =>
        `<li><a class="sl-source" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`
    )
    .join('');
  return section('Источники', `<ul class="sl-sources">${items}</ul>`);
};

/** Полная карточка актива: всё, что нужно знать перед применением. */
export function activeDetail(a) {
  const rel = relationsOf(a.id);
  const preg = PREGNANCY_LABEL[a.pregnancy];

  const relBlock = (level) => {
    const items = rel[level];
    if (!items.length) return '';
    const L = LEVELS[level];
    return `
      <div class="sl-rel sl-rel--${L.tone}">
        <div class="sl-rel__head"><span class="sl-rel__icon">${L.icon}</span>${esc(L.label)}</div>
        <ul class="sl-rel__list">
          ${items
            .map(
              (r) => `<li><button class="sl-rel__item" data-active="${r.active.id}">
                  <span class="sl-rel__name">${activeIcon(r.active, 'sm')} ${esc(r.active.name)}</span>
                  <span class="sl-rel__why">${esc(r.why)}</span>
                </button></li>`
            )
            .join('')}
        </ul>
      </div>`;
  };

  const skinRow = SKIN_TYPES.map((t) => {
    const v = SKIN_VERDICT[a.skin[t.id]];
    return `<div class="sl-skin sl-skin--${v.tone}">
        <span class="sl-skin__icon">${uiIcon(t.id, 'md')}</span>
        <span class="sl-skin__label">${esc(t.label)}</span>
        <span class="sl-skin__verdict">${esc(v.text)}</span>
      </div>`;
  }).join('');

  return `
    <header class="sl-detail__head">
      ${activeIcon(a, 'lg')}
      <div>
        <p class="sl-detail__group">${esc(a.group)}</p>
        <h2 class="sl-detail__title">${esc(a.name)}${a.drug ? ' <span class="sl-badge sl-badge--drug">Лекарство</span>' : ''}</h2>
        <p class="sl-detail__inci">${esc(a.inci)}</p>
      </div>
      <button class="sl-shelf-btn" data-shelf="${a.id}" aria-pressed="false">
        <span class="sl-shelf-btn__on">✓ На полке</span>
        <span class="sl-shelf-btn__off">+ На полку</span>
      </button>
    </header>

    <p class="sl-detail__lead">${esc(a.what)}</p>

    <div class="sl-stats">
      <div class="sl-stat">
        <span class="sl-stat__label">Сила ${tipBtn('Насколько актив «сильный» по действию. Высокая сила — чаще начинайте с меньшей частоты.', { label: 'Что значит сила' })}</span>
        ${meter(a.power)}
      </div>
      <div class="sl-stat">
        <span class="sl-stat__label">Риск раздражения ${tipBtn('Вероятность покраснения, жжения или шелушения. Высокий риск — вводите осторожно и укрепляйте барьер.', { label: 'Что значит риск раздражения' })}</span>
        ${meter(a.irritation)}
      </div>
      <div class="sl-stat"><span class="sl-stat__label">Когда</span><b>${esc(TIME_LABEL[a.time])}</b></div>
      <div class="sl-stat">
        <span class="sl-stat__label">Слой в рутине ${tipBtn('Порядок нанесения: 1 — ближе к очищению, 8 — ближе к крему и SPF. Сначала лёгкие текстуры, потом плотные.', { label: 'Что значит слой' })}</span>
        <b>${a.layer} из 8</b>
      </div>
    </div>

    <div class="sl-flags">
      ${pill(preg.text, preg.tone)}
      ${pill(a.ph)}
      ${a.concerns.map((c) => pill(concernLabel(c))).join('')}
    </div>

    ${section('Что даёт', bullets(a.benefits, 'good'))}
    ${section('Как применять', bullets(a.howTo, 'steps'))}
    ${section('Кому подходит', `<div class="sl-skins">${skinRow}</div>`)}
    ${section('Противопоказания', bullets(a.avoid, 'bad'))}
    ${section('Возможные побочные эффекты', bullets(a.sideFx, 'warn'))}
    ${section('Сочетания', `<div class="sl-rels">${['great', 'ok', 'caution', 'avoid'].map(relBlock).join('')}</div>`)}

    <aside class="sl-tip"><span class="sl-tip__mark">Совет</span><p>${esc(a.tip)}</p></aside>
    ${sourcesBlock(a.sources)}
    <p class="sl-disclaimer">Информация носит справочный характер и не заменяет консультацию дерматолога.</p>
  `;
}

const CONCERN_LABELS = {
  acne: 'Акне',
  pigmentation: 'Пигментация',
  wrinkles: 'Морщины',
  pores: 'Поры',
  redness: 'Покраснения',
  dehydration: 'Обезвоженность',
  texture: 'Рельеф',
  dullness: 'Тусклость',
  barrier: 'Барьер',
};
export const concernLabel = (id) => CONCERN_LABELS[id] || id;

/** Результат проверки совместимости набора активов. */
export function comboResult(result) {
  const { verdict, pairs, list } = result;
  if (list.length < 2) {
    return `<div class="sl-verdict sl-verdict--ok"><h3>${esc(verdict.title)}</h3><p>${esc(verdict.text)}</p></div>`;
  }
  const V = LEVELS[verdict.level];
  return `
    <div class="sl-verdict sl-verdict--${V.tone}">
      <span class="sl-verdict__icon">${V.icon}</span>
      <div><h3>${esc(verdict.title)}</h3><p>${esc(verdict.text)}</p></div>
    </div>
    <div class="sl-pairs">
      ${pairs
        .map((p) => {
          const L = LEVELS[p.level];
          return `<div class="sl-pair sl-pair--${L.tone}">
              <div class="sl-pair__head">
                <span>${activeIcon(p.a, 'sm')} ${esc(p.a.name)}</span>
                <span class="sl-pair__plus">+</span>
                <span>${activeIcon(p.b, 'sm')} ${esc(p.b.name)}</span>
                <span class="sl-pair__badge">${esc(L.short)}</span>
              </div>
              <p class="sl-pair__why">${esc(p.why)}</p>
            </div>`;
        })
        .join('')}
    </div>`;
}

/** Порядок нанесения утром и вечером. */
export function routineView(r) {
  const col = (title, items, icon) => `
    <div class="sl-routine">
      <h4 class="sl-routine__title">${icon} ${esc(title)}</h4>
      ${
        items.length
          ? `<ol class="sl-routine__list">${items
              .map(
                (a) => `<li class="${r.conflicting.has(a.id) ? 'is-conflict' : ''}">
                  ${activeIcon(a, 'sm')}
                  <span class="sl-routine__name">${esc(a.name)}</span>
                  <span class="sl-routine__layer">слой ${a.layer}</span>
                </li>`
              )
              .join('')}</ol>`
          : '<p class="sl-empty">Пока пусто</p>'
      }
    </div>`;
  return `<div class="sl-routines">${col('Утро', r.am, uiIcon('sun', 'sm'))}${col('Вечер', r.pm, uiIcon('moon', 'sm'))}</div>`;
}
