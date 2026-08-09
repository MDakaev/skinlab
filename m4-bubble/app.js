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
} from '/shared/engine.js';
import { productCard, activeDetail, comboResult, routineView, esc } from '/shared/content.js';
import { registerSW, setupInstall } from '/shared/pwa.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const toastEl = $('#toast');

const state = {
  tab: new URLSearchParams(location.search).get('tab') || 'home',
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

const finder = (placeholder) => `
  <div class="finder">
    <input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" aria-label="Поиск" />
    <button class="finder__cam" data-goto="mix" aria-label="Проверить сочетание">🧪</button>
  </div>`;

const bubbles = (list) => `
  <div class="bubble-grid">
    ${list
      .map(
        (a) => `<button class="bubble" data-active="${a.id}">
            <span class="bubble__circle">${a.emoji}</span>
            <b>${esc(a.name)}</b>
            <i>${a.time === 'AM' ? 'утро' : a.time === 'PM' ? 'вечер' : 'в любое время'}</i>
          </button>`
      )
      .join('')}
  </div>`;

/* ---------------- Экраны ---------------- */

function homePage() {
  const p = state.profile;
  const picked = p.skin ? filterActives({ skin: p.skin }) : ACTIVES;
  const shelf = p.shelf.map(getActive).filter(Boolean);

  return `
    <div class="page">
      <section class="hero">
        <span class="hero__emoji">🧴</span>
        <h1>Ваш уход — по полочкам</h1>
        <p>Что с чем можно, кому подходит и как правильно применять. Без страшных слов и без мифов.</p>
      </section>

      ${finder('Введите название средства или актива')}

      <div class="tips">
        <button class="tip-card" data-goto="mix"><span>🧪</span><b>Миксер</b><i>Проверьте, дружат ли ваши средства между собой</i></button>
        <button class="tip-card" data-goto="catalog"><span>📚</span><b>Каталог</b><i>${ACTIVES.length} активов с полным разбором</i></button>
      </div>

      <section class="panel">
        <div class="sect-head"><h2>Какая у вас кожа?</h2>${p.skin ? '<button data-skin="">сбросить</button>' : ''}</div>
        <div class="chip-row">
          ${SKIN_TYPES.map((t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${t.emoji} ${t.label}</button>`).join('')}
        </div>
      </section>

      <section class="panel">
        <div class="sect-head"><h2>${p.skin ? 'Вам подойдёт' : 'Популярное'}</h2><button data-goto="catalog">все активы</button></div>
        ${bubbles(picked.slice(0, 12))}
      </section>

      <section class="panel">
        <div class="sect-head"><h2>Что вас беспокоит?</h2></div>
        <div class="chip-row">${CONCERNS.map((c) => `<button class="chip" data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}</div>
      </section>

      ${
        shelf.length
          ? `<section class="panel">
              <div class="sect-head"><h2>Моя полка</h2><button data-goto="mix">проверить всё</button></div>
              ${bubbles(shelf)}
            </section>`
          : ''
      }
    </div>`;
}

function catalogPage() {
  const found = state.query ? search(state.query) : null;
  const list = found ? found.actives : filterActives({ concern: state.concern });

  return `
    <div class="page">
      <section class="hero">
        <span class="hero__emoji">📚</span>
        <h1>Каталог активов</h1>
        <p>Выберите ингредиент и узнайте всё: применение, противопоказания и сочетания.</p>
      </section>

      ${finder('Название актива или средства')}

      <section class="panel">
        <div class="chip-row">
          <button class="chip${!state.concern ? ' is-on' : ''}" data-concern="">Всё подряд</button>
          ${CONCERNS.map((c) => `<button class="chip${state.concern === c.id ? ' is-on' : ''}" data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}
        </div>
      </section>

      ${
        found && found.products.length
          ? `<section class="panel">
              <div class="sect-head"><h2>Нашли средства</h2></div>
              <div class="bubble-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
                ${found.products.map((p) => productCard(p, p.actives.map((id) => getActive(id)?.name).filter(Boolean))).join('')}
              </div>
            </section>`
          : ''
      }

      <section class="panel">
        <div class="sect-head"><h2>Активы</h2><span class="chip">${list.length}</span></div>
        ${list.length ? bubbles(list) : '<p class="sl-empty">Ничего не нашлось. Попробуйте другое название.</p>'}
      </section>
    </div>`;
}

function mixPage() {
  const result = checkCombo(state.mix);
  const rest = ACTIVES.filter((a) => !state.mix.includes(a.id));

  return `
    <div class="page">
      <section class="hero">
        <span class="hero__emoji">🧪</span>
        <h1>Миксер сочетаний</h1>
        <p>Добавьте средства из своей рутины и проверьте, дружат ли активы между собой.</p>
      </section>

      <section class="panel mixer">
        <div class="sect-head"><h2>Ваш набор</h2>${state.mix.length ? '<button data-clear-mix>очистить</button>' : ''}</div>
        <div class="mixer__slots">
          ${
            state.mix.length
              ? state.mix
                  .map((id) => {
                    const a = getActive(id);
                    return `<span class="mixer__slot">${a.emoji} ${esc(a.name)}<button data-remove="${id}" aria-label="Убрать">✕</button></span>`;
                  })
                  .join('')
              : '<p class="sl-empty">Пока пусто — выберите активы ниже.</p>'
          }
        </div>
      </section>

      ${state.mix.length >= 2 ? `<section class="panel">${comboResult(result)}</section>` : ''}
      ${
        state.mix.length >= 2
          ? `<section class="panel"><div class="sect-head"><h2>Порядок нанесения</h2></div>${routineView(routine(state.mix))}</section>`
          : ''
      }

      <section class="panel">
        <div class="sect-head"><h2>Добавить актив</h2></div>
        <div class="chip-row">${rest.map((a) => `<button class="chip" data-add="${a.id}">${a.emoji} ${esc(a.name)}</button>`).join('')}</div>
      </section>
    </div>`;
}

/* ---------------- Рендер ---------------- */

const PAGES = { home: homePage, catalog: catalogPage, mix: mixPage };

function render({ keepScroll = false } = {}) {
  const top = window.scrollY;
  view.innerHTML = PAGES[state.tab]();
  $$('#nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
  window.scrollTo({ top: keepScroll ? top : 0 });
  syncShelfButtons();
}

function go(tab) {
  state.tab = tab;
  history.replaceState(null, '', `?tab=${tab}`);
  render();
}

function openDetail(id) {
  const a = getActive(id);
  if (!a) return;
  sheetBody.innerHTML = `${activeDetail(a)}
    <div class="btn-row" style="margin-top:22px">
      <button class="btn" data-add="${a.id}">Добавить в миксер</button>
      <button class="btn btn--soft" data-close>Закрыть</button>
    </div>`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  sheet.querySelector('.sheet__panel').scrollTop = 0;
  syncShelfButtons();
}

function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = '';
}

function syncShelfButtons() {
  $$('[data-shelf]').forEach((b) => b.setAttribute('aria-pressed', String(state.profile.shelf.includes(b.dataset.shelf))));
}

/* ---------------- События ---------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

  const tab = t.closest('[data-tab]');
  if (tab) {
    closeSheet();
    return go(tab.dataset.tab);
  }

  const goto = t.closest('[data-goto]');
  if (goto) {
    closeSheet();
    return go(goto.dataset.goto);
  }

  if (t.closest('[data-close]')) return closeSheet();

  const shelfBtn = t.closest('[data-shelf]');
  if (shelfBtn) {
    state.profile = toggleShelf(shelfBtn.dataset.shelf);
    syncShelfButtons();
    return toast(state.profile.shelf.includes(shelfBtn.dataset.shelf) ? 'Добавлено на полку' : 'Убрано с полки');
  }

  const add = t.closest('[data-add]');
  if (add) {
    if (!state.mix.includes(add.dataset.add)) state.mix.push(add.dataset.add);
    if (!sheet.hidden) {
      closeSheet();
      return go('mix');
    }
    return render({ keepScroll: true });
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

  if (t.closest('[data-clear-mix]')) {
    state.mix = [];
    return render({ keepScroll: true });
  }

  const skin = t.closest('[data-skin]');
  if (skin) {
    const id = skin.dataset.skin || null;
    state.profile = saveProfile({ skin: state.profile.skin === id ? null : id });
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
      toast(`${found.brand}: состав отправлен в миксер`);
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
    if (state.tab !== 'catalog') state.tab = 'catalog';
    render({ keepScroll: true });
    const input = $('#q');
    input?.focus();
    input?.setSelectionRange(pos, pos);
  }, 220);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
});

render();
registerSW();
setupInstall($('#install'), { onHint: toast });
