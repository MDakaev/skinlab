/** Общие блоки контента SkinLab. */
import {
  SKIN_TYPES,
  LEVELS,
  relationsOf,
  PREGNANCY_LABEL,
  SKIN_VERDICT,
  TIME_LABEL,
} from './engine.js';
import { activeIcon, uiIcon } from './icons.js';
import { APPLY_LAYERS, APPLY_RULES, MEDICAL_DISCLAIMER } from './guide.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export { activeIcon, uiIcon };

/** Единый дисклеймер для экранов, карточек и оверлеев. */
export function medicalDisclaimer({ long = false } = {}) {
  const text = long ? MEDICAL_DISCLAIMER.long : MEDICAL_DISCLAIMER.short;
  return `<p class="sl-disclaimer">${esc(text)}</p>`;
}

const meter = (value, max = 5) =>
  `<span class="sl-meter" aria-label="${value} из ${max}">${Array.from({ length: max }, (_, i) => `<i class="sl-meter__dot${i < value ? ' is-on' : ''}"></i>`).join('')}</span>`;

function pill(text, tone = '') {
  return `<span class="sl-pill${tone ? ` sl-pill--${tone}` : ''}">${esc(text)}</span>`;
}

/** Кнопка-подсказка: клик/фокус открывает пояснение. */
export function tipBtn(text, { label = 'Что это?' } = {}) {
  return `<button type="button" class="sl-tipbtn" data-tip-toggle aria-expanded="false" aria-label="${esc(label)}">
    <span class="sl-tipbtn__mark" aria-hidden="true">?</span>
    <span class="sl-tipbtn__pop" role="tooltip">${esc(text)}</span>
  </button>`;
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
              (r) => `<li><button class="sl-rel__item" data-focus="${r.active.id}">
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
    ${medicalDisclaimer({ long: true })}
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
const concernLabel = (id) => CONCERN_LABELS[id] || id;
