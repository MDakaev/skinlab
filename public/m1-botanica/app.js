/**
 * SkinLab — сервис сочетаний уход-активов.
 *
 * Главный вопрос, на который отвечает приложение: «что с чем можно наносить».
 * Поэтому экран сочетаний — стартовый, а всё остальное (справочник, профиль)
 * обслуживает его. Второй смысловой центр — «Мой уход»: набор активов женщины,
 * из которого строится недельное расписание без конфликтов.
 */
import {
  ACTIVES,
  CONCERNS,
  SKIN_TYPES,
  LEVELS,
  SKIN_VERDICT,
  PREGNANCY_LABEL,
  TIME_LABEL,
  getActive,
  relationsOf,
  checkCombo,
  search,
  filterActives,
  loadProfile,
  saveProfile,
  toggleShelf,
  resetProfile,
  dismissTip,
} from '../shared/engine.js';
import { weeklyPlan } from '../shared/schedule.js';
import { idealRoutine } from '../shared/ideal.js';
import { activeDetail, activeIcon, applyGuideView, esc, tipBtn, uiIcon } from '../shared/content.js';
import { APP_GUIDE_STEPS, HYDRATION_PARTS, MOISTURIZER_RULES, howToPreview } from '../shared/guide.js';
import { QUIZ_QUESTIONS, scoreQuiz, quizProgress } from '../shared/quiz.js';
import { ICON_LEGEND } from '../shared/icons.js';
import { registerSW, setupInstall } from '../shared/pwa.js';
import { enhanceHScroll } from '../shared/hscroll.js';
import { THEME_OPTIONS, applyTheme, nextTheme, watchSystemTheme } from '../shared/theme.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const view = $('#view');
const tabbar = $('#tabbar');
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const overlay = $('#overlay');
const overlayBody = $('#overlayBody');
const toastEl = $('#toast');

const params = new URLSearchParams(location.search);

const state = {
  tab: params.get('tab') || 'pairs',
  focus: params.get('active') || null,
  query: '',
  concern: null,
  profile: loadProfile(),
  /** 'onboard' | 'help' | 'quiz' | 'apply' | null */
  overlay: null,
  onboardStep: 0,
  quizAnswers: {},
  quizResult: null,
};

/** Активы, с которых женщины чаще всего начинают разбираться в сочетаниях. */
const POPULAR = ['retinol', 'vitc', 'niacinamide', 'aha', 'bha', 'azelaic'];

/** Разделы нижней навигации: id иконки совпадает с глифом в shared/icons.js. */
const TABS = [
  { id: 'pairs', label: 'Сочетания', icon: 'pairs' },
  { id: 'ideal', label: 'Идеал', icon: 'sparkle' },
  { id: 'plan', label: 'Мой уход', icon: 'plan' },
  { id: 'catalog', label: 'Активы', icon: 'catalog' },
  { id: 'me', label: 'Профиль', icon: 'me' },
];

/** Понятные подписи вместо терминов: женщина должна понять вердикт без словаря. */
const BUCKETS = [
  { level: 'great', title: 'Отличная пара', hint: 'Усиливают друг друга — можно в один слой' },
  { level: 'ok', title: 'Совместимы', hint: 'Мешать можно, эффект не пострадает' },
  { level: 'caution', title: 'Осторожно', hint: 'Лучше в разные вечера или через день' },
  { level: 'avoid', title: 'Не вместе', hint: 'В один слой не наносить' },
];

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
}

const onShelf = (id) => state.profile.shelf.includes(id);

/** Тема хранится в профиле, а в документ попадает уже вычисленной. */
function setTheme(pref) {
  state.profile = saveProfile({ theme: pref });
  const resolved = applyTheme(pref);
  syncThemeButton();
  return resolved;
}

function syncThemeButton() {
  const btn = $('#themeBtn');
  if (!btn) return;
  const option = THEME_OPTIONS.find((o) => o.id === state.profile.theme) || THEME_OPTIONS[0];
  btn.innerHTML = uiIcon(option.icon, 'md');
  btn.setAttribute('aria-label', `Оформление: ${option.label.toLowerCase()}. Переключить`);
  btn.title = `Оформление: ${option.label.toLowerCase()}`;
}

function tipBanner(id, text) {
  if (state.profile.dismissedTips?.[id]) return '';
  return `
    <aside class="coach" data-coach="${id}">
      <p>${esc(text)}</p>
      <button type="button" class="coach__ok" data-dismiss-tip="${id}" aria-label="Понятно">Понятно</button>
    </aside>`;
}

/* ---------------- Персональные пометки ---------------- */

/**
 * Пометки под конкретную женщину: лекарство, беременность, тип кожи, увлажнение.
 * @param {object} active
 * @param {{ skipMoisturizer?: boolean }} options — на экране «Мой уход» про крем
 *   уже говорит общий вывод недельного плана, дублировать его у каждого актива незачем.
 */
function personalNotes(active, { skipMoisturizer = false } = {}) {
  const notes = [];
  const p = state.profile;

  if (active.drug) {
    notes.push({ tone: 'warn', text: 'Это лекарственный препарат, а не косметика. Применяйте по инструкции или назначению врача.' });
  }

  if (p.pregnant && active.pregnancy !== 'yes') {
    const preg = PREGNANCY_LABEL[active.pregnancy];
    notes.push({ tone: preg.tone, text: preg.text });
  }

  if (!skipMoisturizer && active.needsMoisturizer && !p.shelf.includes('moisturizer')) {
    notes.push({
      tone: 'warn',
      text: 'После этого актива увлажняющий крем обязателен — в вашем наборе его пока нет.',
    });
  }

  if (p.skin) {
    const verdict = active.skin?.[p.skin];
    if (verdict === 'avoid' || verdict === 'caution') {
      const skinLabel = SKIN_TYPES.find((t) => t.id === p.skin)?.label.toLowerCase();
      notes.push({
        tone: SKIN_VERDICT[verdict].tone,
        text: `${SKIN_VERDICT[verdict].text} для вашего типа кожи (${skinLabel})`,
      });
    }
  }

  return notes;
}

const noteList = (notes) =>
  notes.length
    ? `<div class="notes">${notes
        .map((n) => `<p class="note note--${n.tone}">${esc(n.text)}</p>`)
        .join('')}</div>`
    : '';

/* ---------------- Экран «Сочетания» ---------------- */

function pairsScreen() {
  const active = state.focus ? getActive(state.focus) : null;
  return active ? focusView(active) : pickerView();
}

function pickerView() {
  const found = state.query ? search(state.query).actives : ACTIVES;

  return `
    <div class="screen">
      <div class="hello">
        <h1>Что с чем сочетать</h1>
        <p>Выберите активный ингредиент — покажем, с чем его можно смешивать, а что развести по разным дням.</p>
      </div>

      ${tipBanner('pairs-start', 'Нажмите на актив — откроются «хорошие» и «плохие» пары. Кнопка «?» сверху — инструкция по приложению.')}

      ${searchbar('Ретинол, витамин C, кислоты…')}

      ${
        state.query
          ? ''
          : `<div>
              <div class="section-title"><h2>Спрашивают чаще всего</h2></div>
              <div class="chips">
                ${POPULAR.map((id) => getActive(id))
                  .filter(Boolean)
                  .map((a) => `<button class="chip" data-focus="${a.id}">${activeIcon(a, 'sm')} ${esc(a.name)}</button>`)
                  .join('')}
              </div>
            </div>`
      }

      <div>
        <div class="section-title">
          <h2>${state.query ? 'Нашлось' : 'Все активы'}</h2>
          <span class="sl-pill">${found.length}</span>
        </div>
        ${
          found.length
            ? `<div class="pick-grid">${found.map(pickCard).join('')}</div>`
            : '<p class="empty-note">Ничего не нашлось. Попробуйте другое название.</p>'
        }
      </div>
    </div>`;
}

function pickCard(a) {
  const rel = relationsOf(a.id);
  return `
    <button class="pick" data-focus="${a.id}">
      ${activeIcon(a, 'md')}
      <span class="pick__body">
        <b>${esc(a.name)}</b>
        <i>${esc(a.group)}</i>
      </span>
      <span class="pick__counts">
        ${rel.great.length ? `<em class="tone-good">${rel.great.length} ✓</em>` : ''}
        ${rel.avoid.length ? `<em class="tone-bad">${rel.avoid.length} ✕</em>` : ''}
      </span>
    </button>`;
}

function focusView(a) {
  const rel = relationsOf(a.id);
  const notes = personalNotes(a);
  const known = BUCKETS.reduce((sum, b) => sum + rel[b.level].length, 0);
  const steps = howToPreview(a, 3);

  return `
    <div class="screen">
      <button class="back" data-focus="">← Другой актив</button>

      <article class="focus">
        <div class="focus__top">
          ${activeIcon(a, 'lg')}
          <div>
            <p class="focus__group">${esc(a.group)}</p>
            <h1>${esc(a.name)}</h1>
            <p class="focus__inci">${esc(a.inci)}</p>
          </div>
        </div>
        <p class="focus__lead">${esc(a.tagline)}</p>
        <div class="focus__meta">
          <span class="sl-pill sl-pill--${a.time === 'PM' ? 'night' : a.time === 'AM' ? 'day' : ''}">${esc(TIME_LABEL[a.time])}</span>
          <span class="sl-pill">${known} известных сочетаний</span>
        </div>
        ${noteList(notes)}

        ${
          steps.length
            ? `<div class="howto-preview">
                <div class="section-title">
                  <h2>Как наносить</h2>
                  <button type="button" data-open-apply>Общие правила</button>
                </div>
                <ol class="howto-preview__list">
                  ${steps.map((s) => `<li>${esc(s)}</li>`).join('')}
                </ol>
                ${a.howTo.length > steps.length ? `<button type="button" class="linkish" data-detail="${a.id}">Все шаги и детали →</button>` : ''}
              </div>`
            : ''
        }

        <div class="focus__actions">
          <button class="btn-primary" data-shelf-toggle="${a.id}">
            ${onShelf(a.id) ? '✓ В моём уходе' : '+ В мой уход'}
          </button>
          <button class="btn-second" data-detail="${a.id}">Подробнее</button>
        </div>
      </article>

      ${BUCKETS.map((b) => bucketBlock(b, rel[b.level])).join('')}

      ${
        known === 0
          ? `<p class="empty-note">Для этого актива пока не описаны сочетания. Это не значит, что их нет — просто мы не добавляем пары без источника.</p>`
          : ''
      }
    </div>`;
}

function bucketBlock(bucket, items) {
  if (!items.length) return '';
  const L = LEVELS[bucket.level];
  return `
    <section class="bucket bucket--${L.tone}">
      <header class="bucket__head">
        <span class="bucket__icon">${L.icon}</span>
        <div>
          <h2>${esc(bucket.title)} ${tipBtn(bucket.hint)}</h2>
          <p>${esc(bucket.hint)}</p>
        </div>
        <span class="bucket__count">${items.length}</span>
      </header>
      <ul class="bucket__list">
        ${items
          .map(
            (r) => `<li>
              <button class="bucket__item" data-focus="${r.active.id}">
                <span class="bucket__name">${activeIcon(r.active, 'sm')} ${esc(r.active.name)}</span>
                <span class="bucket__why">${esc(r.why)}</span>
              </button>
            </li>`
          )
          .join('')}
      </ul>
    </section>`;
}

/* ---------------- Экран «Идеальный уход» ---------------- */

function idealScreen() {
  const p = state.profile;
  const ideal = idealRoutine(p);
  const plan = weeklyPlan(ideal.ids, { experience: ideal.experience });
  const adopted = ideal.ids.every((id) => p.shelf.includes(id));

  return `
    <div class="screen">
      <div class="hello">
        <h1>Идеальный уход</h1>
        <p>Готовая рутина под ваши настройки: тип кожи, задачи, беременность и то, привыкла ли кожа к активам.</p>
      </div>

      ${tipBanner('ideal-intro', 'Меняйте настройки прямо здесь — рутина пересобирается сразу. Базовые шаги (очищение, крем, SPF) остаются всегда.')}

      ${idealSettings(p, ideal)}

      ${ideal.notes.length ? noteList(ideal.notes) : ''}

      <div class="routine-cols">
        ${routineColumn('Утро', 'sun', ideal.am)}
        ${routineColumn('Вечер', 'moon', ideal.pm)}
      </div>

      <div class="ideal-cta">
        <button class="btn-primary" data-adopt-ideal${adopted ? ' disabled' : ''}>
          ${adopted ? '✓ Это уже ваш набор' : 'Сделать это моим уходом'}
        </button>
        <p class="hint">Активы попадут в раздел «Мой уход», где можно смотреть недельное расписание и добавлять своё.</p>
      </div>

      <div>
        <div class="section-title">
          <h2>Как это ложится на неделю ${tipBtn('Сильные активы стоят не каждый день: частота зависит от раздражающего потенциала и режима адаптации.')}</h2>
        </div>
        ${weekView(plan)}
      </div>

      ${
        ideal.excluded.length
          ? `<div>
              <div class="section-title"><h2>Что не вошло и почему</h2></div>
              <div class="excluded">
                ${ideal.excluded
                  .slice(0, 6)
                  .map(
                    (e) => `<button class="excluded__row excluded__row--${e.tone}" data-focus="${e.active.id}">
                      <span class="excluded__name">${activeIcon(e.active, 'sm')} ${esc(e.active.name)}</span>
                      <span class="excluded__why">${esc(e.why)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <button class="btn-second" data-open-hydration>Почему увлажняющий крем обязателен</button>
      <p class="sl-disclaimer">Подбор построен на общих правилах и не учитывает диагнозы. При розацеа, дерматите и во время беременности схему согласуют с дерматологом.</p>
    </div>`;
}

/** Настройки прямо на экране: подбор должен меняться без похода в профиль. */
function idealSettings(p, ideal) {
  const skin = SKIN_TYPES.find((t) => t.id === p.skin);

  return `
    <section class="setup">
      <div class="setup__head">
        <b>Ваши настройки</b>
        <span class="sl-pill${skin ? '' : ' sl-pill--night'}">${skin ? esc(skin.label) : 'тип кожи не выбран'}</span>
      </div>

      <div class="setup__block">
        <p class="setup__label">Тип кожи</p>
        <div class="chips">
          ${SKIN_TYPES.map(
            (t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${uiIcon(t.id, 'sm')} ${esc(t.label)}</button>`
          ).join('')}
          <button class="chip" data-open-quiz>Пройти тест</button>
        </div>
      </div>

      <div class="setup__block">
        <p class="setup__label">Что хотите решить${ideal.usingDefaults ? ' — пока ничего не выбрано' : ''}</p>
        <div class="chips">
          ${CONCERNS.map(
            (c) => `<button class="chip${p.concerns.includes(c.id) ? ' is-on' : ''}" data-concern-toggle="${c.id}">${uiIcon(c.id, 'sm')} ${esc(c.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div class="setup__switches">
        <button class="setup__switch${p.pregnant ? ' is-on' : ''}" data-pregnant-toggle aria-pressed="${p.pregnant}">
          Беременность и лактация
        </button>
        <button class="setup__switch${p.experience === 'adapted' ? ' is-on' : ''}" data-experience-toggle aria-pressed="${p.experience === 'adapted'}">
          Кожа привыкла к активам
        </button>
      </div>
    </section>`;
}

function routineColumn(title, icon, steps) {
  return `
    <section class="routine">
      <h2 class="routine__title">${uiIcon(icon, 'sm')} ${esc(title)}</h2>
      <ol class="routine__list">
        ${steps
          .map(
            (s) => `<li class="routine__step${s.required ? ' is-required' : ''}${s.support ? ' is-support' : ''}">
              <span class="routine__num">${s.step}</span>
              <div class="routine__body">
                <div class="routine__head">
                  ${s.active && !s.icon ? activeIcon(s.active, 'sm') : `<span class="routine__glyph">${uiIcon(s.icon, 'sm')}</span>`}
                  <b>${esc(s.title)}</b>
                  ${s.required ? '<span class="routine__badge">обязательно</span>' : ''}
                  ${s.support ? '<span class="routine__badge routine__badge--soft">поддержка</span>' : ''}
                  ${s.frequency ? `<span class="routine__freq">${esc(s.frequency)}</span>` : ''}
                </div>
                <p>${esc(s.text)}</p>
                ${s.skinWarning ? '<p class="routine__warn">Для вашего типа кожи — с осторожностью: начните с минимальной частоты.</p>' : ''}
                ${s.pregnancyWarning ? '<p class="routine__warn">При беременности — только по согласованию с врачом.</p>' : ''}
                ${s.active ? `<button class="linkish" data-detail="${s.active.id}">Подробнее про ${esc(s.active.name.toLowerCase())} →</button>` : ''}
              </div>
            </li>`
          )
          .join('')}
      </ol>
    </section>`;
}

/* ---------------- Экран «Мой уход» ---------------- */

function planScreen() {
  const shelf = state.profile.shelf.map(getActive).filter(Boolean);

  if (!shelf.length) {
    return `
      <div class="screen">
        <div class="hello">
          <h1>Мой уход</h1>
          <p>Добавьте активы, которые уже используете — соберём расписание, где ничего не конфликтует.</p>
        </div>
        ${tipBanner('plan-empty', 'Добавьте то, что уже стоит в ванной. Из набора соберём неделю: утро и вечер без конфликтующих пар.')}
        <p class="empty-note">Пока пусто. Начните с того, что стоит у вас в ванной.</p>
        <div>
          <div class="section-title"><h2>Добавить быстро</h2></div>
          <div class="chips">
            ${['moisturizer', 'spf', ...POPULAR]
              .map((id) => getActive(id))
              .filter(Boolean)
              .map((a) => `<button class="chip" data-shelf-toggle="${a.id}">+ ${activeIcon(a, 'sm')} ${esc(a.name)}</button>`)
              .join('')}
          </div>
        </div>
        <button class="btn-primary" data-goto="ideal">Собрать идеальный уход по моим настройкам</button>
        <button class="btn-second" data-goto="pairs">Открыть справочник сочетаний</button>
      </div>`;
  }

  const combo = checkCombo(state.profile.shelf);
  const plan = weeklyPlan(state.profile.shelf, { experience: state.profile.experience });
  const problems = combo.pairs.filter((p) => p.level === 'avoid' || p.level === 'caution');
  const personal = shelf.flatMap((a) =>
    personalNotes(a, { skipMoisturizer: true }).map((n) => ({ ...n, text: `${a.name}: ${n.text}` }))
  );

  const V = LEVELS[combo.verdict.level];

  return `
    <div class="screen">
      <div class="hello">
        <h1>Мой уход</h1>
        <p>${shelf.length} ${plural(shelf.length, 'актив', 'актива', 'активов')} в наборе.</p>
      </div>

      <div class="verdict verdict--${V.tone}">
        <span class="verdict__icon">${V.icon}</span>
        <div>
          <h2>${esc(combo.verdict.title)}</h2>
          <p>${esc(combo.verdict.text)}</p>
        </div>
      </div>

      ${personal.length ? `<div><div class="section-title"><h2>Важно для вас</h2></div>${noteList(personal)}</div>` : ''}

      <div>
        <div class="section-title">
          <h2>Неделя без конфликтов ${tipBtn('Сильные активы чередуем по дням. Режим «мягче» снижает частоту, пока кожа привыкает.')}</h2>
          <button data-experience-toggle>${state.profile.experience === 'start' ? 'Кожа привыкла?' : 'Начать мягче'}</button>
        </div>
        <p class="hint">${
          state.profile.experience === 'start'
            ? 'Режим для непривыкшей кожи: сильные активы стоят реже.'
            : 'Режим для адаптированной кожи: частота выше.'
        }</p>
        ${weekView(plan)}
        ${plan.notes.length ? noteList(plan.notes) : ''}
      </div>

      ${
        problems.length
          ? `<div>
              <div class="section-title"><h2>За чем следить</h2></div>
              <div class="pairs">
                ${problems
                  .map((p) => {
                    const L = LEVELS[p.level];
                    return `<div class="pair pair--${L.tone}">
                        <div class="pair__head">
                          <span>${activeIcon(p.a, 'sm')} ${esc(p.a.name)}</span>
                          <span class="pair__plus">+</span>
                          <span>${activeIcon(p.b, 'sm')} ${esc(p.b.name)}</span>
                          <span class="pair__badge">${esc(L.short)}</span>
                        </div>
                        <p class="pair__why">${esc(p.why)}</p>
                      </div>`;
                  })
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <div>
        <div class="section-title"><h2>В наборе</h2></div>
        <div class="shelf">
          ${shelf
            .map(
              (a) => `<div class="shelf__row">
                <button class="shelf__main" data-focus="${a.id}">
                  ${activeIcon(a, 'sm')}
                  <b>${esc(a.name)}</b>
                  <i>${esc(TIME_LABEL[a.time])}</i>
                </button>
                <button class="shelf__remove" data-shelf-toggle="${a.id}" aria-label="Убрать ${esc(a.name)}">${uiIcon('close', 'sm')}</button>
              </div>`
            )
            .join('')}
        </div>
      </div>

      ${
        onShelf('moisturizer')
          ? ''
          : `<button class="btn-primary" data-shelf-toggle="moisturizer">+ Добавить увлажняющий крем</button>`
      }
      <button class="btn-second" data-goto="ideal">Показать идеальный уход для меня</button>
      <button class="btn-second" data-goto="catalog">Добавить ещё актив</button>
      <button class="btn-second" data-open-apply>Как правильно наносить активы</button>
      <button class="btn-second" data-open-hydration>Увлажнение: чем и зачем</button>
    </div>`;
}

function weekView(plan) {
  const slot = (items) =>
    items.length
      ? `<div class="week__items">${items
          .map((a) => `<button class="week__chip" data-focus="${a.id}" title="${esc(a.name)}" aria-label="${esc(a.name)}">${activeIcon(a, 'sm')}</button>`)
          .join('')}</div>`
      : '<span class="week__empty">—</span>';

  return `
    <div class="week">
      <div class="week__legend">
        <span></span>
        <span>${uiIcon('sun', 'sm')} Утро</span>
        <span>${uiIcon('moon', 'sm')} Вечер</span>
      </div>
      ${plan.days
        .map(
          (d) => `<div class="week__row">
            <span class="week__day">${esc(d.label)}</span>
            ${slot(d.am)}
            ${slot(d.pm)}
          </div>`
        )
        .join('')}
    </div>`;
}

/* ---------------- Экран «Активы» ---------------- */

function catalogScreen() {
  const found = state.query ? search(state.query).actives : filterActives({ concern: state.concern, skin: state.profile.skin });

  return `
    <div class="screen">
      <div class="hello">
        <h1>Активы</h1>
        <p>Что делает ингредиент, кому подходит и когда его лучше не использовать.</p>
      </div>

      ${tipBanner('catalog-icons', 'Цвет иконки подсказывает группу: ретиноиды, кислоты, увлажнение и т.д. Нажмите на актив — откроется инструкция по нанесению.')}

      ${searchbar('Название актива')}

      <div class="chips">
        <button class="chip${!state.concern ? ' is-on' : ''}" data-concern="">Все задачи</button>
        ${CONCERNS.map(
          (c) => `<button class="chip${state.concern === c.id ? ' is-on' : ''}" data-concern="${c.id}">${uiIcon(c.id, 'sm')} ${esc(c.label)}</button>`
        ).join('')}
      </div>

      ${
        state.profile.skin && !state.query
          ? `<p class="hint">Скрыты активы, которые не подходят вашему типу кожи. <button class="linkish" data-goto="me">Изменить</button></p>`
          : ''
      }

      <div class="icon-legend" aria-label="Легенда иконок">
        ${ICON_LEGEND.map((l) => `<span class="icon-legend__item"><i class="sl-ico sl-ico--xs sl-ico--${l.tone}"></i>${esc(l.label)}</span>`).join('')}
      </div>

      <div>
        <div class="section-title"><h2>Найдено</h2><span class="sl-pill">${found.length}</span></div>
        ${
          found.length
            ? `<div class="pick-grid">${found.map(pickCard).join('')}</div>`
            : '<p class="empty-note">Ничего не нашлось. Попробуйте снять фильтры.</p>'
        }
      </div>

      <button class="btn-second" data-open-apply>Общая инструкция по нанесению</button>
    </div>`;
}

/* ---------------- Экран «Профиль» ---------------- */

function meScreen() {
  const p = state.profile;
  const skin = SKIN_TYPES.find((t) => t.id === p.skin);

  return `
    <div class="screen">
      <div class="hello">
        <h1>Профиль</h1>
        <p>Всё сохраняется на этом устройстве: тип кожи, задачи, набор активов и настройки.</p>
      </div>

      <div class="profile-card">
        <div class="profile-card__row">
          <div>
            <b>Тип кожи</b>
            <i>${skin ? `${uiIcon(skin.id, 'sm')} ${esc(skin.label)}` : 'Ещё не определён'}${p.quizDone ? ' · по тесту' : ''}</i>
          </div>
          <button class="btn-primary" data-open-quiz>${p.quizDone || p.skin ? 'Пройти тест снова' : 'Пройти тест'}</button>
        </div>
        <p class="hint">Тест из 6 вопросов подскажет тип кожи. Можно выбрать вручную ниже.</p>
      </div>

      <div>
        <div class="section-title"><h2>Тип кожи</h2>${p.skin ? '<button data-skin="">Сбросить</button>' : ''}</div>
        <div class="chips">
          ${SKIN_TYPES.map(
            (t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${uiIcon(t.id, 'sm')} ${esc(t.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div>
        <div class="section-title"><h2>Что хотите решить</h2></div>
        <div class="chips">
          ${CONCERNS.map(
            (c) => `<button class="chip${p.concerns.includes(c.id) ? ' is-on' : ''}" data-concern-toggle="${c.id}">${uiIcon(c.id, 'sm')} ${esc(c.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div class="switch-row">
        <div>
          <b>Беременность или лактация ${tipBtn('Мы покажем предупреждения у активов, которые в этот период обычно не применяют.')}</b>
          <i>Предупредим про активы, которые в этот период не применяют.</i>
        </div>
        <button class="switch${p.pregnant ? ' is-on' : ''}" data-pregnant-toggle aria-pressed="${p.pregnant}">
          <span></span>
        </button>
      </div>

      <div class="switch-row">
        <div>
          <b>Кожа уже привыкла к активам ${tipBtn('Влияет только на частоту сильных активов в недельном плане «Мой уход».')}</b>
          <i>Влияет на частоту сильных активов в недельном плане.</i>
        </div>
        <button class="switch${p.experience === 'adapted' ? ' is-on' : ''}" data-experience-toggle aria-pressed="${p.experience === 'adapted'}">
          <span></span>
        </button>
      </div>

      <div>
        <div class="section-title"><h2>Оформление</h2></div>
        <div class="theme-seg" role="group" aria-label="Тема оформления">
          ${THEME_OPTIONS.map(
            (o) => `<button class="theme-seg__btn${p.theme === o.id ? ' is-on' : ''}" data-theme-set="${o.id}" aria-pressed="${p.theme === o.id}">
              ${uiIcon(o.icon, 'sm')} ${esc(o.label)}
            </button>`
          ).join('')}
        </div>
        <p class="hint">«Системная» переключается вместе с ночным режимом телефона.</p>
      </div>

      <div class="help-links">
        <button class="help-link" data-open-help><span>${uiIcon('catalog', 'md')}</span> Как пользоваться приложением</button>
        <button class="help-link" data-open-apply><span>${uiIcon('bottle', 'md')}</span> Как наносить активы</button>
        <button class="help-link" data-open-hydration><span>${uiIcon('cream', 'md')}</span> Увлажнение: чем и зачем</button>
        <button class="help-link" data-open-onboard><span>${uiIcon('sparkle', 'md')}</span> Показать знакомство снова</button>
      </div>

      <section class="about">
        <h2>Откуда данные</h2>
        <p>
          Справочник собран вручную по клиническим публикациям, рекомендациям дерматологических
          ассоциаций и регуляторным документам. Пары ингредиентов не добавляются «по логике»:
          если у сочетания нет подтверждения, оно не появится в приложении.
        </p>
        <p>
          Приложение не ставит диагнозы и не заменяет врача. При розацеа, обострении дерматита,
          беременности и приёме системных препаратов схему ухода согласуют с дерматологом.
        </p>
        <p class="hint">Данные профиля хранятся только в браузере на этом устройстве (localStorage).</p>
      </section>

      <button class="btn-second" id="installInline" hidden>Установить приложение</button>
      <button class="btn-second danger" data-reset>Сбросить настройки и набор</button>

      <p class="sl-disclaimer">Информация носит справочный характер и не заменяет консультацию дерматолога.</p>
    </div>`;
}

/* ---------------- Оверлеи: онбординг, помощь, квиз, нанесение ---------------- */

function openOverlay(kind) {
  state.overlay = kind;
  if (kind === 'onboard') state.onboardStep = 0;
  if (kind === 'quiz') {
    state.quizAnswers = {};
    state.quizResult = null;
  }
  renderOverlay();
}

function closeOverlay({ persistOnboard = false } = {}) {
  if (persistOnboard || state.overlay === 'onboard') {
    state.profile = saveProfile({ onboarded: true });
  }
  state.overlay = null;
  overlay.hidden = true;
  document.body.style.overflow = sheet.hidden ? '' : 'hidden';
}

function renderOverlay() {
  if (!state.overlay) {
    overlay.hidden = true;
    return;
  }
  const builders = {
    onboard: onboardMarkup,
    help: helpMarkup,
    quiz: quizMarkup,
    apply: applyMarkup,
    hydration: hydrationMarkup,
  };
  overlayBody.innerHTML = (builders[state.overlay] || helpMarkup)();
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.overlay__panel', overlay).scrollTop = 0;
}

function onboardMarkup() {
  const step = APP_GUIDE_STEPS[state.onboardStep];
  const last = state.onboardStep >= APP_GUIDE_STEPS.length - 1;
  return `
    <div class="onboard">
      <p class="onboard__eyebrow">Знакомство · ${state.onboardStep + 1} из ${APP_GUIDE_STEPS.length}</p>
      <div class="onboard__icon" aria-hidden="true">${uiIcon(step.icon, 'xl')}</div>
      <h2 id="overlayTitle">${esc(step.title)}</h2>
      <p>${esc(step.text)}</p>
      <div class="onboard__dots" aria-hidden="true">
        ${APP_GUIDE_STEPS.map((_, i) => `<i class="${i === state.onboardStep ? 'is-on' : ''}"></i>`).join('')}
      </div>
      <div class="onboard__actions">
        ${
          state.onboardStep > 0
            ? `<button type="button" class="btn-second" data-onboard-prev>Назад</button>`
            : `<button type="button" class="btn-second" data-overlay-close>Пропустить</button>`
        }
        <button type="button" class="btn-primary" data-onboard-next>${last ? 'Начать' : 'Дальше'}</button>
      </div>
    </div>`;
}

function helpMarkup() {
  return `
    <div class="help">
      <h2 id="overlayTitle">Как пользоваться SkinLab</h2>
      <p class="help__lead">Коротко по разделам — этого достаточно, чтобы ориентироваться.</p>
      <ol class="help__steps">
        ${APP_GUIDE_STEPS.map(
          (s) => `<li>
            <span class="help__icon" aria-hidden="true">${uiIcon(s.icon, 'md')}</span>
            <div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>
          </li>`
        ).join('')}
      </ol>
      <button type="button" class="btn-primary" data-overlay-close>Понятно</button>
      <button type="button" class="btn-second" data-open-apply>Как наносить активы</button>
    </div>`;
}

function applyMarkup() {
  return `
    <div class="help">
      <h2 id="overlayTitle">Как наносить активы</h2>
      <p class="help__lead">Общий порядок слоёв. У каждого актива в карточке — своя пошаговая инструкция.</p>
      ${applyGuideView()}
      <button type="button" class="btn-primary" data-overlay-close>Понятно</button>
    </div>`;
}

function hydrationMarkup() {
  return `
    <div class="help">
      <h2 id="overlayTitle">Увлажнение: чем и зачем</h2>
      <p class="help__lead">
        Крем — единственный шаг рутины без выходных. Он не «мешает» активам: он закрывает барьер,
        который кислоты и ретиноиды намеренно расшатывают.
      </p>

      <div class="hydration">
        ${HYDRATION_PARTS.map(
          (part) => `<div class="hydration__part">
            <b>${esc(part.title)}</b>
            <i>${esc(part.inci)}</i>
            <p>${esc(part.text)}</p>
          </div>`
        ).join('')}
      </div>

      <div class="sl-apply__rules">
        ${MOISTURIZER_RULES.map(
          (r) => `<div class="sl-apply__rule"><b>${esc(r.title)}</b><p>${esc(r.text)}</p></div>`
        ).join('')}
      </div>

      <button type="button" class="btn-primary" data-shelf-toggle="moisturizer">
        ${onShelf('moisturizer') ? '✓ Крем уже в вашем уходе' : '+ Добавить крем в мой уход'}
      </button>
      <button type="button" class="btn-second" data-overlay-close>Закрыть</button>
    </div>`;
}

function quizMarkup() {
  if (state.quizResult) {
    const r = state.quizResult;
    const skinMeta = SKIN_TYPES.find((t) => t.id === r.skin);
    return `
      <div class="quiz">
        <p class="onboard__eyebrow">Результат теста</p>
        <div class="quiz__result-icon" aria-hidden="true">${uiIcon(skinMeta?.id || 'sparkle', 'xl')}</div>
        <h2 id="overlayTitle">${esc(r.title)}</h2>
        <p>${esc(r.text)}</p>
        ${
          r.confident
            ? ''
            : '<p class="hint">Результат на границе двух типов — можно скорректировать вручную в профиле.</p>'
        }
        <div class="onboard__actions">
          <button type="button" class="btn-second" data-quiz-restart>Пройти снова</button>
          <button type="button" class="btn-primary" data-quiz-apply="${r.skin}">Сохранить тип кожи</button>
        </div>
      </div>`;
  }

  const { done, total } = quizProgress(state.quizAnswers);
  const current = QUIZ_QUESTIONS.find((q) => !state.quizAnswers[q.id]);
  if (!current) {
    const r = scoreQuiz(state.quizAnswers);
    state.quizResult = r;
    return quizMarkup();
  }

  return `
    <div class="quiz">
      <p class="onboard__eyebrow">Тест типа кожи · ${done + 1} из ${total}</p>
      <div class="quiz__bar" aria-hidden="true"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
      <h2 id="overlayTitle">${esc(current.title)}</h2>
      <div class="quiz__options">
        ${current.options
          .map(
            (o) => `<button type="button" class="quiz__opt" data-quiz-answer="${current.id}:${o.id}">
              ${esc(o.label)}
            </button>`
          )
          .join('')}
      </div>
      <div class="onboard__actions">
        <button type="button" class="btn-second" data-overlay-close>Закрыть</button>
      </div>
    </div>`;
}

/* ---------------- Общее ---------------- */

function searchbar(placeholder) {
  return `
    <div class="searchbar">
      <span class="searchbar__icon" aria-hidden="true">${uiIcon('search', 'md')}</span>
      <input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" aria-label="Поиск" />
      ${state.query ? `<button class="searchbar__clear" data-clear-query aria-label="Очистить">${uiIcon('close', 'sm')}</button>` : ''}
    </div>`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const SCREENS = { pairs: pairsScreen, ideal: idealScreen, plan: planScreen, catalog: catalogScreen, me: meScreen };

function renderTabbar() {
  tabbar.innerHTML = TABS.map(
    (t) => `<button type="button" data-tab="${t.id}"${state.tab === t.id ? ' class="is-active" aria-current="page"' : ''}>
      <span class="tabbar__ico">${uiIcon(t.icon || t.id, 'lg')}</span>${esc(t.label)}
    </button>`
  ).join('');
}

function render({ keepScroll = false } = {}) {
  const top = view.scrollTop;
  view.innerHTML = (SCREENS[state.tab] || pairsScreen)();
  renderTabbar();
  view.scrollTop = keepScroll ? top : 0;
  enhanceHScroll(view);
  if (state.tab === 'me') setupInstall($('#installInline'), { onHint: toast });
}

function go(tab, { focus } = {}) {
  state.tab = tab;
  if (focus !== undefined) state.focus = focus;
  state.query = '';
  syncUrl();
  render();
}

function syncUrl() {
  const next = new URLSearchParams({ tab: state.tab });
  if (state.tab === 'pairs' && state.focus) next.set('active', state.focus);
  history.replaceState(null, '', `?${next}`);
}

function openDetail(id) {
  const a = getActive(id);
  if (!a) return;
  const notes = personalNotes(a);
  sheetBody.innerHTML = `
    <div class="sl-detail">${activeDetail(a)}</div>
    ${notes.length ? `<div class="sheet-notes">${noteList(notes)}</div>` : ''}
    <button class="btn-primary sheet-cta" data-shelf-toggle="${a.id}">
      ${onShelf(a.id) ? '✓ Убрать из моего ухода' : '+ Добавить в мой уход'}
    </button>`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.sheet__panel', sheet).scrollTop = 0;
}

function closeSheet() {
  sheet.hidden = true;
  if (overlay.hidden) document.body.style.overflow = '';
}

/* ---------------- События ---------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

  const tipToggle = t.closest('[data-tip-toggle]');
  if (tipToggle) {
    const open = tipToggle.getAttribute('aria-expanded') === 'true';
    $$('[data-tip-toggle][aria-expanded="true"]').forEach((el) => {
      if (el !== tipToggle) el.setAttribute('aria-expanded', 'false');
    });
    tipToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    return;
  }

  if (t.closest('#helpBtn')) return openOverlay('help');

  if (t.closest('[data-open-help]')) return openOverlay('help');
  if (t.closest('[data-open-onboard]')) return openOverlay('onboard');
  if (t.closest('[data-open-apply]')) return openOverlay('apply');
  if (t.closest('[data-open-hydration]')) return openOverlay('hydration');
  if (t.closest('[data-open-quiz]')) return openOverlay('quiz');

  if (t.closest('[data-overlay-close]')) {
    closeOverlay({ persistOnboard: state.overlay === 'onboard' });
    return;
  }

  if (t.closest('[data-onboard-next]')) {
    if (state.onboardStep >= APP_GUIDE_STEPS.length - 1) {
      closeOverlay({ persistOnboard: true });
      toast('Готово — можно выбирать актив');
      return render();
    }
    state.onboardStep += 1;
    return renderOverlay();
  }

  if (t.closest('[data-onboard-prev]')) {
    state.onboardStep = Math.max(0, state.onboardStep - 1);
    return renderOverlay();
  }

  const quizAnswer = t.closest('[data-quiz-answer]');
  if (quizAnswer) {
    const [qid, oid] = quizAnswer.dataset.quizAnswer.split(':');
    state.quizAnswers = { ...state.quizAnswers, [qid]: oid };
    const { done, total } = quizProgress(state.quizAnswers);
    if (done === total) state.quizResult = scoreQuiz(state.quizAnswers);
    return renderOverlay();
  }

  if (t.closest('[data-quiz-restart]')) {
    state.quizAnswers = {};
    state.quizResult = null;
    return renderOverlay();
  }

  const quizApply = t.closest('[data-quiz-apply]');
  if (quizApply) {
    state.profile = saveProfile({
      skin: quizApply.dataset.quizApply,
      quizDone: true,
      quizAnswers: state.quizAnswers,
    });
    closeOverlay();
    state.tab = 'me';
    syncUrl();
    render();
    return toast('Тип кожи сохранён в профиле');
  }

  const dismiss = t.closest('[data-dismiss-tip]');
  if (dismiss) {
    state.profile = dismissTip(dismiss.dataset.dismissTip);
    return render({ keepScroll: true });
  }

  const tab = t.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab, { focus: null });

  const goto = t.closest('[data-goto]');
  if (goto) {
    closeSheet();
    return go(goto.dataset.goto, { focus: null });
  }

  if (t.closest('[data-close]')) return closeSheet();

  const focus = t.closest('[data-focus]');
  if (focus) {
    closeSheet();
    state.focus = focus.dataset.focus || null;
    state.tab = 'pairs';
    state.query = '';
    syncUrl();
    return render();
  }

  const detail = t.closest('[data-detail]');
  if (detail) return openDetail(detail.dataset.detail);

  const shelfBtn = t.closest('[data-shelf-toggle]');
  if (shelfBtn) {
    const id = shelfBtn.dataset.shelfToggle;
    const wasOn = onShelf(id);
    state.profile = toggleShelf(id);
    closeSheet();
    render({ keepScroll: true });
    if (state.overlay) renderOverlay();
    return toast(wasOn ? 'Убрали из вашего ухода' : `${getActive(id).name} в вашем уходе`);
  }

  if (t.closest('[data-adopt-ideal]')) {
    const ideal = idealRoutine(state.profile);
    const merged = [...new Set([...state.profile.shelf, ...ideal.ids])];
    state.profile = saveProfile({ shelf: merged });
    go('plan');
    return toast('Идеальный уход перенесён в «Мой уход»');
  }

  const skin = t.closest('[data-skin]');
  if (skin) {
    const id = skin.dataset.skin || null;
    state.profile = saveProfile({ skin: state.profile.skin === id ? null : id });
    return render({ keepScroll: true });
  }

  const concernToggle = t.closest('[data-concern-toggle]');
  if (concernToggle) {
    const id = concernToggle.dataset.concernToggle;
    const next = state.profile.concerns.includes(id)
      ? state.profile.concerns.filter((c) => c !== id)
      : [...state.profile.concerns, id];
    state.profile = saveProfile({ concerns: next });
    return render({ keepScroll: true });
  }

  const concern = t.closest('[data-concern]');
  if (concern) {
    const id = concern.dataset.concern || null;
    state.concern = state.concern === id ? null : id;
    state.query = '';
    if (state.tab !== 'catalog') {
      state.tab = 'catalog';
      syncUrl();
    }
    return render({ keepScroll: true });
  }

  if (t.closest('[data-pregnant-toggle]')) {
    state.profile = saveProfile({ pregnant: !state.profile.pregnant });
    render({ keepScroll: true });
    return toast(state.profile.pregnant ? 'Учтём беременность в предупреждениях' : 'Отметку о беременности убрали');
  }

  if (t.closest('[data-experience-toggle]')) {
    const next = state.profile.experience === 'start' ? 'adapted' : 'start';
    state.profile = saveProfile({ experience: next });
    render({ keepScroll: true });
    return toast(next === 'adapted' ? 'Частота активов повышена' : 'Вернули мягкий режим');
  }

  const themeSet = t.closest('[data-theme-set]');
  if (themeSet) {
    const resolved = setTheme(themeSet.dataset.themeSet);
    render({ keepScroll: true });
    return toast(resolved === 'dark' ? 'Включили тёмную тему' : 'Включили светлую тему');
  }

  if (t.closest('#themeBtn')) {
    setTheme(nextTheme(state.profile.theme));
    if (state.tab === 'me') render({ keepScroll: true });
    const label = THEME_OPTIONS.find((o) => o.id === state.profile.theme)?.label || '';
    return toast(`Оформление: ${label.toLowerCase()}`);
  }

  if (t.closest('[data-clear-query]')) {
    state.query = '';
    return render({ keepScroll: true });
  }

  if (t.closest('[data-reset]')) {
    state.profile = resetProfile();
    render();
    return toast('Настройки сброшены');
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  clearTimeout(document._debounce);
  document._debounce = setTimeout(() => {
    const pos = e.target.selectionStart;
    if (state.tab === 'pairs') state.focus = null;
    render({ keepScroll: true });
    const input = $('#q');
    input?.focus();
    input?.setSelectionRange(pos, pos);
  }, 200);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!overlay.hidden) return closeOverlay({ persistOnboard: state.overlay === 'onboard' });
  if (!sheet.hidden) closeSheet();
});

applyTheme(state.profile.theme);
watchSystemTheme(
  () => state.profile.theme,
  () => syncThemeButton()
);

render();
syncThemeButton();
registerSW();
setupInstall($('#install'), { onHint: toast });

if (!state.profile.onboarded) {
  openOverlay('onboard');
}
