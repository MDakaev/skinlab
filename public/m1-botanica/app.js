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
} from '/shared/engine.js';
import { weeklyPlan } from '/shared/schedule.js';
import { activeDetail, esc } from '/shared/content.js';
import { registerSW, setupInstall } from '/shared/pwa.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const toastEl = $('#toast');

const params = new URLSearchParams(location.search);

const state = {
  tab: params.get('tab') || 'pairs',
  focus: params.get('active') || null,
  query: '',
  concern: null,
  profile: loadProfile(),
};

/** Активы, с которых женщины чаще всего начинают разбираться в сочетаниях. */
const POPULAR = ['retinol', 'vitc', 'niacinamide', 'aha', 'bha', 'azelaic'];

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

/* ---------------- Персональные пометки ---------------- */

/**
 * Предупреждения под конкретную женщину: беременность и тип кожи.
 * Это единственное место, где данные справочника превращаются в личный совет.
 */
function personalNotes(active) {
  const notes = [];
  const p = state.profile;

  if (active.drug) {
    notes.push({ tone: 'warn', text: 'Это лекарственный препарат, а не косметика. Применяйте по инструкции или назначению врача.' });
  }

  if (p.pregnant && active.pregnancy !== 'yes') {
    const preg = PREGNANCY_LABEL[active.pregnancy];
    notes.push({ tone: preg.tone, text: preg.text });
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

      ${searchbar('Ретинол, витамин C, кислоты…')}

      ${
        state.query
          ? ''
          : `<div>
              <div class="section-title"><h2>Спрашивают чаще всего</h2></div>
              <div class="chips">
                ${POPULAR.map((id) => getActive(id))
                  .filter(Boolean)
                  .map((a) => `<button class="chip" data-focus="${a.id}">${a.emoji} ${esc(a.name)}</button>`)
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
      <span class="pick__emoji">${a.emoji}</span>
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

  return `
    <div class="screen">
      <button class="back" data-focus="">← Другой актив</button>

      <article class="focus">
        <div class="focus__top">
          <span class="focus__emoji">${a.emoji}</span>
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
          <h2>${esc(bucket.title)}</h2>
          <p>${esc(bucket.hint)}</p>
        </div>
        <span class="bucket__count">${items.length}</span>
      </header>
      <ul class="bucket__list">
        ${items
          .map(
            (r) => `<li>
              <button class="bucket__item" data-focus="${r.active.id}">
                <span class="bucket__name">${r.active.emoji} ${esc(r.active.name)}</span>
                <span class="bucket__why">${esc(r.why)}</span>
              </button>
            </li>`
          )
          .join('')}
      </ul>
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
        <p class="empty-note">Пока пусто. Начните с того, что стоит у вас в ванной.</p>
        <div>
          <div class="section-title"><h2>Добавить быстро</h2></div>
          <div class="chips">
            ${POPULAR.map((id) => getActive(id))
              .filter(Boolean)
              .map((a) => `<button class="chip" data-shelf-toggle="${a.id}">+ ${a.emoji} ${esc(a.name)}</button>`)
              .join('')}
          </div>
        </div>
        <button class="btn-second" data-goto="pairs">Открыть справочник сочетаний</button>
      </div>`;
  }

  const combo = checkCombo(state.profile.shelf);
  const plan = weeklyPlan(state.profile.shelf, { experience: state.profile.experience });
  const problems = combo.pairs.filter((p) => p.level === 'avoid' || p.level === 'caution');
  const personal = shelf.flatMap((a) => personalNotes(a).map((n) => ({ ...n, text: `${a.name}: ${n.text}` })));

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
          <h2>Неделя без конфликтов</h2>
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
                          <span>${p.a.emoji} ${esc(p.a.name)}</span>
                          <span class="pair__plus">+</span>
                          <span>${p.b.emoji} ${esc(p.b.name)}</span>
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
                  <span>${a.emoji}</span>
                  <b>${esc(a.name)}</b>
                  <i>${esc(TIME_LABEL[a.time])}</i>
                </button>
                <button class="shelf__remove" data-shelf-toggle="${a.id}" aria-label="Убрать ${esc(a.name)}">✕</button>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <button class="btn-second" data-goto="catalog">Добавить ещё актив</button>
    </div>`;
}

function weekView(plan) {
  const slot = (items) =>
    items.length
      ? `<div class="week__items">${items.map((a) => `<button class="week__chip" data-focus="${a.id}" title="${esc(a.name)}">${a.emoji}</button>`).join('')}</div>`
      : '<span class="week__empty">—</span>';

  return `
    <div class="week">
      <div class="week__legend"><span></span><span>☀️ Утро</span><span>🌙 Вечер</span></div>
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

      ${searchbar('Название актива')}

      <div class="chips">
        <button class="chip${!state.concern ? ' is-on' : ''}" data-concern="">Все задачи</button>
        ${CONCERNS.map(
          (c) => `<button class="chip${state.concern === c.id ? ' is-on' : ''}" data-concern="${c.id}">${c.emoji} ${esc(c.label)}</button>`
        ).join('')}
      </div>

      ${
        state.profile.skin && !state.query
          ? `<p class="hint">Скрыты активы, которые не подходят вашему типу кожи. <button class="linkish" data-goto="me">Изменить</button></p>`
          : ''
      }

      <div>
        <div class="section-title"><h2>Найдено</h2><span class="sl-pill">${found.length}</span></div>
        ${
          found.length
            ? `<div class="pick-grid">${found.map(pickCard).join('')}</div>`
            : '<p class="empty-note">Ничего не нашлось. Попробуйте снять фильтры.</p>'
        }
      </div>
    </div>`;
}

/* ---------------- Экран «Профиль» ---------------- */

function meScreen() {
  const p = state.profile;

  return `
    <div class="screen">
      <div class="hello">
        <h1>Профиль</h1>
        <p>Настройки влияют на предупреждения и на частоту активов в расписании.</p>
      </div>

      <div>
        <div class="section-title"><h2>Тип кожи</h2>${p.skin ? '<button data-skin="">Сбросить</button>' : ''}</div>
        <div class="chips">
          ${SKIN_TYPES.map(
            (t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${t.emoji} ${esc(t.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div>
        <div class="section-title"><h2>Что хотите решить</h2></div>
        <div class="chips">
          ${CONCERNS.map(
            (c) => `<button class="chip${p.concerns.includes(c.id) ? ' is-on' : ''}" data-concern-toggle="${c.id}">${c.emoji} ${esc(c.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div class="switch-row">
        <div>
          <b>Беременность или лактация</b>
          <i>Предупредим про активы, которые в этот период не применяют.</i>
        </div>
        <button class="switch${p.pregnant ? ' is-on' : ''}" data-pregnant-toggle aria-pressed="${p.pregnant}">
          <span></span>
        </button>
      </div>

      <div class="switch-row">
        <div>
          <b>Кожа уже привыкла к активам</b>
          <i>Влияет на частоту сильных активов в недельном плане.</i>
        </div>
        <button class="switch${p.experience === 'adapted' ? ' is-on' : ''}" data-experience-toggle aria-pressed="${p.experience === 'adapted'}">
          <span></span>
        </button>
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
      </section>

      <button class="btn-second" id="installInline" hidden>Установить приложение</button>
      <button class="btn-second danger" data-reset>Сбросить настройки и набор</button>

      <p class="sl-disclaimer">Информация носит справочный характер и не заменяет консультацию дерматолога.</p>
    </div>`;
}

/* ---------------- Общее ---------------- */

function searchbar(placeholder) {
  return `
    <div class="searchbar">
      <span class="searchbar__icon">🔍</span>
      <input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" aria-label="Поиск" />
      ${state.query ? '<button class="searchbar__clear" data-clear-query aria-label="Очистить">✕</button>' : ''}
    </div>`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const SCREENS = { pairs: pairsScreen, plan: planScreen, catalog: catalogScreen, me: meScreen };

function render({ keepScroll = false } = {}) {
  const top = view.scrollTop;
  view.innerHTML = (SCREENS[state.tab] || pairsScreen)();
  $$('#tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
  view.scrollTop = keepScroll ? top : 0;
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
  document.body.style.overflow = '';
}

/* ---------------- События ---------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

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
    return toast(wasOn ? 'Убрали из вашего ухода' : `${getActive(id).name} в вашем уходе`);
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

  if (t.closest('[data-clear-query]')) {
    state.query = '';
    return render({ keepScroll: true });
  }

  if (t.closest('[data-reset]')) {
    state.profile = saveProfile({ skin: null, concerns: [], shelf: [], pregnant: false, experience: 'start' });
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
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
});

render();
registerSW();
setupInstall($('#install'), { onHint: toast });
