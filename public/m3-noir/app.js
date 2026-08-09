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
  groups,
} from '/shared/engine.js';
import { activeCard, productCard, activeDetail, comboResult, routineView, esc } from '/shared/content.js';
import { registerSW, setupInstall } from '/shared/pwa.js';
import { enhanceHScroll } from '/shared/hscroll.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const view = $('#view');
const modal = $('#modal');
const modalBody = $('#modalBody');
const toastEl = $('#toast');

const state = {
  tab: new URLSearchParams(location.search).get('tab') || 'home',
  query: '',
  concern: null,
  group: null,
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
  <div class="glass finder">
    <input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" aria-label="Поиск" />
    <button class="finder__btn" data-goto="mix">Проверить сочетание</button>
  </div>`;

/* ---------------- Экраны ---------------- */

function homePage() {
  const p = state.profile;
  const forSkin = p.skin ? filterActives({ skin: p.skin }) : ACTIVES;
  const gentle = ACTIVES.filter((a) => a.irritation <= 2).slice(0, 8);
  const strong = ACTIVES.filter((a) => a.power >= 4).slice(0, 8);

  return `
    <div class="page">
      <section class="hero">
        <h1>Активы без мифов. <em>Только то, что работает.</em></h1>
        <p>Введите название средства или выберите ингредиент: покажем схему применения, противопоказания, безопасные пары и конфликты.</p>
      </section>

      ${finder('Ретинол, азелаиновая кислота, The Ordinary…')}

      <div class="stats-row">
        <button class="glass stat-tile" data-goto="catalog"><b>${ACTIVES.length}</b><span>активов в справочнике</span></button>
        <button class="glass stat-tile" data-goto="mix"><b>${ACTIVES.length * 2}+</b><span>проверенных сочетаний</span></button>
        <div class="glass stat-tile"><b>${p.shelf.length}</b><span>на вашей полке</span></div>
      </div>

      <section>
        <div class="sect-head"><h2>Ваш тип кожи</h2>${p.skin ? '<button data-skin="">сбросить</button>' : ''}</div>
        <div class="chip-row">
          ${SKIN_TYPES.map((t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${t.emoji} ${t.label}</button>`).join('')}
        </div>
      </section>

      <section>
        <div class="sect-head"><h2>${p.skin ? 'Подойдёт вашей коже' : 'Основа основ'}</h2><button data-goto="catalog">весь каталог</button></div>
        <div class="rail-scroll">${forSkin.slice(0, 8).map((a) => activeCard(a)).join('')}</div>
      </section>

      <section>
        <div class="sect-head"><h2>Мягкий старт</h2><span class="sl-pill">риск раздражения 1–2</span></div>
        <div class="rail-scroll">${gentle.map((a) => activeCard(a)).join('')}</div>
      </section>

      <section>
        <div class="sect-head"><h2>Тяжёлая артиллерия</h2><span class="sl-pill">нужен SPF и осторожность</span></div>
        <div class="rail-scroll">${strong.map((a) => activeCard(a)).join('')}</div>
      </section>

      <section>
        <div class="sect-head"><h2>По задаче</h2></div>
        <div class="chip-row">${CONCERNS.map((c) => `<button class="chip" data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}</div>
      </section>
    </div>`;
}

function catalogPage() {
  const found = state.query ? search(state.query) : null;
  const list = found ? found.actives : filterActives({ concern: state.concern, group: state.group });

  return `
    <div class="page">
      <section class="hero"><h1>Каталог активов</h1></section>
      ${finder('Название актива или средства')}

      <div class="chip-row">
        <button class="chip${!state.group && !state.concern ? ' is-on' : ''}" data-group="">Все</button>
        ${groups().map((g) => `<button class="chip${state.group === g ? ' is-on' : ''}" data-group="${esc(g)}">${esc(g)}</button>`).join('')}
      </div>

      <div class="chip-row">
        ${CONCERNS.map((c) => `<button class="chip${state.concern === c.id ? ' is-on' : ''}" data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}
      </div>

      ${
        found && found.products.length
          ? `<section><div class="sect-head"><h2>Средства</h2></div>
             <div class="cards">${found.products
               .map((p) => productCard(p, p.actives.map((id) => getActive(id)?.name).filter(Boolean)))
               .join('')}</div></section>`
          : ''
      }

      <section>
        <div class="sect-head"><h2>Ингредиенты</h2><span class="sl-pill">${list.length}</span></div>
        ${list.length ? `<div class="cards">${list.map((a) => activeCard(a)).join('')}</div>` : '<p class="sl-empty">Ничего не нашлось.</p>'}
      </section>
    </div>`;
}

function mixPage() {
  const result = checkCombo(state.mix);
  const rest = ACTIVES.filter((a) => !state.mix.includes(a.id));

  return `
    <div class="page">
      <section class="hero"><h1>Лаборатория сочетаний</h1><p>Соберите набор активов и проверьте, что можно наносить вместе, а что развести по дням.</p></section>

      <div class="lab">
        <div>
          ${state.mix.length >= 2 ? comboResult(result) : '<p class="sl-empty">Добавьте минимум два актива справа или из списка ниже.</p>'}
          ${state.mix.length >= 2 ? `<div class="sect-head" style="margin-top:26px"><h2>Порядок нанесения</h2></div>${routineView(routine(state.mix))}` : ''}

          <div class="sect-head" style="margin-top:26px"><h2>Добавить актив</h2></div>
          <div class="chip-row">${rest.map((a) => `<button class="chip" data-add="${a.id}">${a.emoji} ${esc(a.name)}</button>`).join('')}</div>
        </div>

        <div class="glass lab__panel">
          <h3 style="font-family:var(--font-head);font-size:16px">Ваш набор</h3>
          ${
            state.mix.length
              ? state.mix
                  .map((id) => {
                    const a = getActive(id);
                    return `<div class="lab__slot"><span>${a.emoji}</span>${esc(a.name)}<button data-remove="${id}" aria-label="Убрать">✕</button></div>`;
                  })
                  .join('')
              : '<p class="sl-empty">Пока пусто</p>'
          }
          ${state.mix.length ? '<button class="btn btn--ghost" data-clear-mix>Очистить набор</button>' : ''}
        </div>
      </div>
    </div>`;
}

/* ---------------- Рендер ---------------- */

const PAGES = { home: homePage, catalog: catalogPage, mix: mixPage };

function render({ keepScroll = false } = {}) {
  const top = window.scrollY;
  view.innerHTML = PAGES[state.tab]();
  $$('#nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
  window.scrollTo({ top: keepScroll ? top : 0 });
  enhanceHScroll(document);
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
  modalBody.innerHTML = `${activeDetail(a)}
    <div class="btn-row" style="margin-top:22px">
      <button class="btn" data-add="${a.id}">В лабораторию сочетаний</button>
      <button class="btn btn--ghost" data-close>Закрыть</button>
    </div>`;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal__panel').scrollTop = 0;
  syncShelfButtons();
}

function closeModal() {
  modal.hidden = true;
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
    closeModal();
    return go(tab.dataset.tab);
  }

  const goto = t.closest('[data-goto]');
  if (goto) {
    closeModal();
    return go(goto.dataset.goto);
  }

  if (t.closest('[data-close]')) return closeModal();

  const shelfBtn = t.closest('[data-shelf]');
  if (shelfBtn) {
    state.profile = toggleShelf(shelfBtn.dataset.shelf);
    syncShelfButtons();
    return toast(state.profile.shelf.includes(shelfBtn.dataset.shelf) ? 'Добавлено на полку' : 'Убрано с полки');
  }

  const add = t.closest('[data-add]');
  if (add) {
    if (!state.mix.includes(add.dataset.add)) state.mix.push(add.dataset.add);
    if (!modal.hidden) {
      closeModal();
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

  const group = t.closest('[data-group]');
  if (group) {
    const g = group.dataset.group || null;
    state.group = state.group === g ? null : g;
    state.concern = null;
    return render({ keepScroll: true });
  }

  const concern = t.closest('[data-concern]');
  if (concern) {
    const id = concern.dataset.concern || null;
    state.concern = state.concern === id ? null : id;
    state.group = null;
    state.query = '';
    return state.tab === 'catalog' ? render({ keepScroll: true }) : go('catalog');
  }

  const product = t.closest('[data-product]');
  if (product) {
    const found = PRODUCTS.find((p) => p.id === product.dataset.product);
    if (found) {
      found.actives.forEach((id) => !state.mix.includes(id) && state.mix.push(id));
      toast(`${found.brand}: состав отправлен в лабораторию`);
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
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

render();
registerSW();
setupInstall($('#install'), { onHint: toast });
