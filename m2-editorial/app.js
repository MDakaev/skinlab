import {
  ACTIVES,
  PRODUCTS,
  CONCERNS,
  SKIN_TYPES,
  getActive,
  search,
  filterActives,
  checkCombo,
  routine,
  loadProfile,
  saveProfile,
  toggleShelf,
  LEVELS,
} from '../shared/engine.js';
import { activeDetail, comboResult, routineView, esc } from '../shared/content.js';
import { registerSW, setupInstall } from '../shared/pwa.js';
import { enhanceHScroll } from '../shared/hscroll.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const view = $('#view');
const rail = $('#rail');
const toastEl = $('#toast');

const state = {
  tab: new URLSearchParams(location.search).get('tab') || 'home',
  detail: null,
  query: '',
  concern: null,
  mix: [],
  profile: loadProfile(),
};

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
}

const num = (i) => String(i + 1).padStart(2, '0');

function indexRows(list) {
  return `<ol class="index">${list
    .map(
      (a, i) => `<li><button class="index__row" data-active="${a.id}">
          <span class="index__num">${num(i)}</span>
          <span class="index__name">${esc(a.name)} <i>${esc(a.inci)}</i></span>
          <span class="index__tag">${esc(a.group)}</span>
        </button></li>`
    )
    .join('')}</ol>`;
}

/* ---------------- Экраны ---------------- */

function homePage() {
  const p = state.profile;
  const featured = p.skin ? filterActives({ skin: p.skin }).slice(0, 6) : ACTIVES.slice(0, 6);

  return `
    <div class="page">
      <p class="kicker">Выпуск №1 · ${ACTIVES.length} активов</p>
      <h1 class="display">Что вы наносите на лицо и почему это работает</h1>
      <p class="standfirst">
        Разбираем действующие вещества по существу: как применять, с чем сочетать,
        кому подходят и когда лучше отложить до консультации с врачом.
      </p>

      <div class="rule"></div>

      <div class="search-line">
        <input id="q" type="search" value="${esc(state.query)}" placeholder="Ретинол, ниацинамид, CeraVe…" aria-label="Поиск" />
        <button data-goto="mix">Проверить сочетание</button>
      </div>

      <div class="rule"></div>

      <div class="tiles">
        <button class="tile" data-goto="catalog"><em>Раздел 02</em><b>Указатель</b><span>Все активы с профилем действия, противопоказаниями и сочетаниями.</span></button>
        <button class="tile" data-goto="mix"><em>Раздел 03</em><b>Сочетания</b><span>Проверьте, не конфликтуют ли средства в одной рутине.</span></button>
      </div>

      <div class="rule"></div>

      <p class="kicker">Тип кожи</p>
      <div class="rule--thick"></div>
      <div class="taglist">
        ${SKIN_TYPES.map(
          (t) => `<button data-skin="${t.id}" class="${p.skin === t.id ? 'is-on' : ''}">${t.emoji} ${t.label}</button>`
        ).join('')}
      </div>

      <div class="rule"></div>

      <blockquote class="pullquote">
        «Ретинол с кислотами в один вечер» — самая частая причина повреждённого барьера.
        <small>Проверяйте сочетания до того, как нанесёте, а не после.</small>
      </blockquote>

      <div class="rule"></div>

      <p class="kicker">${p.skin ? 'Подходит вашему типу кожи' : 'С чего начать'}</p>
      <div class="rule--thick"></div>
      ${indexRows(featured)}

      <div class="rule"></div>
      <p class="kicker">По задачам</p>
      <div class="rule--thick"></div>
      <div class="taglist">
        ${CONCERNS.map((c) => `<button data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}
      </div>
    </div>`;
}

function catalogPage() {
  const found = state.query ? search(state.query) : null;
  const list = found ? found.actives : filterActives({ concern: state.concern });

  return `
    <div class="page">
      <p class="kicker">Раздел 02</p>
      <h1 class="display">Указатель активов</h1>

      <div class="search-line">
        <input id="q" type="search" value="${esc(state.query)}" placeholder="Название актива или средства" aria-label="Поиск" />
        <button data-goto="mix">Проверить сочетание</button>
      </div>

      <div class="rule"></div>

      <div class="taglist">
        <button data-concern="" class="${!state.concern ? 'is-on' : ''}">Все</button>
        ${CONCERNS.map(
          (c) => `<button data-concern="${c.id}" class="${state.concern === c.id ? 'is-on' : ''}">${c.emoji} ${c.label}</button>`
        ).join('')}
      </div>

      ${
        found && found.products.length
          ? `<div class="rule"></div><p class="kicker">Средства</p><div class="rule--thick"></div>
             <ol class="index">${found.products
               .map(
                 (p, i) => `<li><button class="index__row" data-product="${p.id}">
                    <span class="index__num">${num(i)}</span>
                    <span class="index__name">${esc(p.name)} <i>${esc(p.brand)}</i></span>
                    <span class="index__tag">${esc(p.type)}</span>
                  </button></li>`
               )
               .join('')}</ol>`
          : ''
      }

      <div class="rule"></div>
      <p class="kicker">Ингредиенты · ${list.length}</p>
      <div class="rule--thick"></div>
      ${list.length ? indexRows(list) : '<p class="standfirst">Ничего не нашлось. Попробуйте другое написание.</p>'}
    </div>`;
}

function articlePage() {
  const a = getActive(state.detail);
  return `
    <div class="page article">
      <button class="article__back" data-goto="catalog">← Назад к указателю</button>
      ${activeDetail(a)}
      <div class="rule"></div>
      <div class="btn-row">
        <button class="btn" data-add="${a.id}">Добавить в проверку сочетаний</button>
        <button class="btn btn--light" data-goto="catalog">К другим активам</button>
      </div>
    </div>`;
}

function mixPage() {
  const result = checkCombo(state.mix);
  const rest = ACTIVES.filter((a) => !state.mix.includes(a.id));

  return `
    <div class="page">
      <p class="kicker">Раздел 04</p>
      <h1 class="display">Сочетания</h1>
      <p class="standfirst">Соберите набор активов из своей рутины и посмотрите, что с чем уживается.</p>
      <div class="rule"></div>

      ${state.mix.length >= 2 ? comboResult(result) : '<p class="standfirst">Выберите минимум два актива в списке ниже.</p>'}
      ${
        state.mix.length >= 2
          ? `<div class="rule"></div><p class="kicker">Порядок нанесения</p><div class="rule--thick"></div>${routineView(routine(state.mix))}`
          : ''
      }

      <div class="rule"></div>
      <p class="kicker">Добавить в набор</p>
      <div class="rule--thick"></div>
      <ol class="index">${rest
        .map(
          (a, i) => `<li><button class="index__row" data-add="${a.id}">
              <span class="index__num">${num(i)}</span>
              <span class="index__name">${esc(a.name)} <i>${esc(a.inci)}</i></span>
              <span class="index__tag">+ в набор</span>
            </button></li>`
        )
        .join('')}</ol>
    </div>`;
}

/* ---------------- Правая колонка ---------------- */

function renderRail() {
  const mix = state.mix.map(getActive).filter(Boolean);
  const shelf = state.profile.shelf.map(getActive).filter(Boolean);
  const result = checkCombo(state.mix);
  const V = LEVELS[result.verdict.level];

  rail.innerHTML = `
    <p class="rail__title">Набор для проверки</p>
    ${
      mix.length
        ? mix
            .map(
              (a) => `<div class="rail__item"><span>${a.emoji}</span><span>${esc(a.name)}</span><button data-remove="${a.id}" aria-label="Убрать">✕</button></div>`
            )
            .join('') +
          (mix.length >= 2
            ? `<div class="mini-verdict"><b>${V.icon} ${esc(result.verdict.title)}</b>${esc(result.verdict.text)}</div>
               <button class="btn" data-goto="mix">Подробный разбор</button>`
            : '')
        : '<p class="rail__empty">Добавьте активы из указателя, чтобы проверить их совместимость.</p>'
    }

    <p class="rail__title" style="margin-top:18px">Моя полка</p>
    ${
      shelf.length
        ? shelf
            .map((a) => `<button class="rail__item" data-active="${a.id}"><span>${a.emoji}</span><span>${esc(a.name)}</span><span>→</span></button>`)
            .join('')
        : '<p class="rail__empty">Сохраняйте активы, которые уже используете.</p>'
    }`;
}

/* ---------------- Рендер ---------------- */

const PAGES = { home: homePage, catalog: catalogPage, mix: mixPage, detail: articlePage };

function render({ keepScroll = false } = {}) {
  const top = window.scrollY;
  view.innerHTML = PAGES[state.tab]();
  $$('#nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
  renderRail();
  window.scrollTo({ top: keepScroll ? top : 0 });
  enhanceHScroll(document);
  syncShelfButtons();
}

function go(tab) {
  state.tab = tab;
  state.detail = null;
  history.replaceState(null, '', `?tab=${tab}`);
  render();
}

function openDetail(id) {
  if (!getActive(id)) return;
  state.detail = id;
  state.tab = 'detail';
  $$('#nav button').forEach((b) => b.classList.remove('is-active'));
  render();
}

function syncShelfButtons() {
  $$('[data-shelf]').forEach((b) => b.setAttribute('aria-pressed', String(state.profile.shelf.includes(b.dataset.shelf))));
}

/* ---------------- События ---------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

  const tab = t.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);

  const goto = t.closest('[data-goto]');
  if (goto) return go(goto.dataset.goto);

  const shelfBtn = t.closest('[data-shelf]');
  if (shelfBtn) {
    state.profile = toggleShelf(shelfBtn.dataset.shelf);
    syncShelfButtons();
    renderRail();
    return toast(state.profile.shelf.includes(shelfBtn.dataset.shelf) ? 'Добавлено на полку' : 'Убрано с полки');
  }

  const add = t.closest('[data-add]');
  if (add) {
    if (!state.mix.includes(add.dataset.add)) state.mix.push(add.dataset.add);
    toast('Добавлено в набор');
    return render({ keepScroll: state.tab !== 'detail' });
  }

  const addAll = t.closest('[data-add-all]');
  if (addAll) {
    JSON.parse(addAll.dataset.addAll).forEach((id) => !state.mix.includes(id) && state.mix.push(id));
    return go('mix');
  }

  const remove = t.closest('[data-remove]');
  if (remove) {
    state.mix = state.mix.filter((id) => id !== remove.dataset.remove);
    return render({ keepScroll: true });
  }

  const skin = t.closest('[data-skin]');
  if (skin) {
    state.profile = saveProfile({ skin: state.profile.skin === skin.dataset.skin ? null : skin.dataset.skin });
    return render({ keepScroll: true });
  }

  const concern = t.closest('[data-concern]');
  if (concern) {
    const id = concern.dataset.concern || null;
    state.concern = state.concern === id ? null : id;
    state.query = '';
    return state.tab === 'catalog' ? render({ keepScroll: true }) : go('catalog');
  }

  const product = t.closest('[data-product]');
  if (product) {
    const found = PRODUCTS.find((p) => p.id === product.dataset.product);
    if (found) {
      found.actives.forEach((id) => !state.mix.includes(id) && state.mix.push(id));
      toast(`${found.brand}: состав добавлен в набор`);
      return go('mix');
    }
  }

  const card = t.closest('[data-active]');
  if (card) return openDetail(card.dataset.active);
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  const pos = e.target.selectionStart;
  clearTimeout(document._d);
  document._d = setTimeout(() => {
    if (state.tab !== 'catalog') {
      state.tab = 'catalog';
      state.detail = null;
    }
    render({ keepScroll: true });
    const input = $('#q');
    input?.focus();
    input?.setSelectionRange(pos, pos);
  }, 220);
});

render();
registerSW();
setupInstall($('#install'), { onHint: toast });
