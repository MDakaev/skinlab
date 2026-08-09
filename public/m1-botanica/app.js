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
import { activeCard, productCard, activeDetail, comboResult, routineView, esc } from '/shared/content.js';
import { createScanner } from '/shared/scanner.js';
import { registerSW, setupInstall } from '/shared/pwa.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const toastEl = $('#toast');

const state = {
  tab: new URLSearchParams(location.search).get('tab') || 'home',
  query: '',
  concern: null,
  skin: null,
  mix: [],
  profile: loadProfile(),
  scan: null,
};

let scanner = null;

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
}

/* ---------------- Экраны ---------------- */

function homeScreen() {
  const p = state.profile;
  const picked = p.skin ? filterActives({ skin: p.skin }).slice(0, 4) : ACTIVES.slice(0, 4);
  const shelf = p.shelf.map(getActive).filter(Boolean);

  return `
    <div class="screen">
      <div class="hello">
        <h1>Разберём ваш уход по составу</h1>
        <p>Введите название средства или выберите актив — расскажем, как применять, с чем сочетать и когда лучше не стоит.</p>
      </div>

      ${searchbarHTML('Например: ретинол или Effaclar Duo')}

      <div class="mini-row">
        <button class="mini" data-goto="scan"><span>📷</span><b>Сканер</b><i>по упаковке</i></button>
        <button class="mini" data-goto="mix"><span>🧪</span><b>Пара</b><i>совместимость</i></button>
        <button class="mini" data-goto="catalog"><span>📖</span><b>Каталог</b><i>${ACTIVES.length} актива</i></button>
      </div>

      <div>
        <div class="section-title"><h2>Ваш тип кожи</h2>${p.skin ? '<button data-clear-skin>Сбросить</button>' : ''}</div>
        <div class="chips">
          ${SKIN_TYPES.map(
            (t) => `<button class="chip${p.skin === t.id ? ' is-on' : ''}" data-skin="${t.id}">${t.emoji} ${t.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="banner">
        <div class="banner__glow"></div>
        <h3>Проверьте, не конфликтуют ли ваши средства</h3>
        <p>Ретинол с кислотами в один вечер — частая причина повреждённого барьера.</p>
        <button data-goto="mix">Проверить сочетание</button>
      </div>

      <div>
        <div class="section-title">
          <h2>${p.skin ? 'Подходит вашей коже' : 'С чего начать'}</h2>
          <button data-goto="catalog">Все</button>
        </div>
        <div class="grid">${picked.map((a) => activeCard(a)).join('')}</div>
      </div>

      <div>
        <div class="section-title"><h2>Задача</h2></div>
        <div class="chips">
          ${CONCERNS.map((c) => `<button class="chip" data-concern="${c.id}">${c.emoji} ${c.label}</button>`).join('')}
        </div>
      </div>

      ${
        shelf.length
          ? `<div>
              <div class="section-title"><h2>Моя полка</h2><button data-goto="mix">В проверку</button></div>
              <div class="grid">${shelf.map((a) => activeCard(a)).join('')}</div>
            </div>`
          : ''
      }
    </div>`;
}

function searchbarHTML(placeholder) {
  return `
    <div class="searchbar">
      <span class="searchbar__icon">🔍</span>
      <input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" aria-label="Поиск" />
      <button class="searchbar__cam" data-goto="scan" aria-label="Сканировать упаковку">📷</button>
    </div>`;
}

function catalogScreen() {
  const found = state.query ? search(state.query) : null;
  const list = found ? found.actives : filterActives({ concern: state.concern, skin: state.skin });

  return `
    <div class="screen">
      <div class="hello"><h1>Активы</h1><p>Справочник ингредиентов с проверенным профилем действия.</p></div>
      ${searchbarHTML('Название актива или средства')}

      <div class="chips">
        <button class="chip${!state.concern ? ' is-on' : ''}" data-concern="">Все задачи</button>
        ${CONCERNS.map(
          (c) => `<button class="chip${state.concern === c.id ? ' is-on' : ''}" data-concern="${c.id}">${c.emoji} ${c.label}</button>`
        ).join('')}
      </div>

      ${
        found && found.products.length
          ? `<div>
              <div class="section-title"><h2>Средства</h2></div>
              <div class="grid">${found.products
                .map((p) => productCard(p, p.actives.map((id) => getActive(id)?.name).filter(Boolean)))
                .join('')}</div>
            </div>`
          : ''
      }

      <div>
        <div class="section-title"><h2>Ингредиенты</h2><span class="sl-pill">${list.length}</span></div>
        ${list.length ? `<div class="grid">${list.map((a) => activeCard(a)).join('')}</div>` : '<p class="empty-note">Ничего не нашлось. Попробуйте другое название.</p>'}
      </div>
    </div>`;
}

function scanScreen() {
  const r = state.scan;
  return `
    <div class="screen">
      <div class="hello"><h1>Сканер упаковки</h1><p>Наведите камеру на состав или упаковку средства.</p></div>

      <div class="sl-scan-stage" id="stage">
        <video id="video" playsinline muted></video>
        <canvas id="canvas" hidden></canvas>
        <div class="sl-scan-frame"></div>
        <div class="sl-scan-hint" id="hint">Камера выключена</div>
      </div>

      <div class="scan-actions">
        <button class="btn-primary" id="shot">Сделать снимок</button>
        <button class="btn-second" id="pickFile">Галерея</button>
        <input type="file" id="file" accept="image/*" capture="environment" hidden />
      </div>

      <p class="sl-demo-note">Демо-режим: распознавание состава ещё не подключено, результат берётся из тестового каталога.</p>

      ${
        r
          ? `<div class="result-card">
              <div class="result-card__top">
                ${r.frame ? `<img class="result-card__shot" src="${r.frame}" alt="Кадр" />` : '<div class="result-card__shot"></div>'}
                <div>
                  <b>${esc(r.product.brand)}</b>
                  <div>${esc(r.product.name)}</div>
                  <div class="result-card__conf">Совпадение ${Math.round(r.confidence * 100)}% · демо-данные</div>
                </div>
              </div>
              <div class="grid">${r.product.actives.map((id) => activeCard(getActive(id))).join('')}</div>
              <button class="btn-second" data-add-all='${JSON.stringify(r.product.actives)}'>Добавить в проверку сочетаний</button>
            </div>`
          : ''
      }
    </div>`;
}

function mixScreen() {
  const result = checkCombo(state.mix);
  const rest = ACTIVES.filter((a) => !state.mix.includes(a.id));

  return `
    <div class="screen">
      <div class="hello"><h1>Совместимость</h1><p>Добавьте активы, которые планируете использовать вместе.</p></div>

      <div class="mix-slots">
        ${
          state.mix.length
            ? state.mix
                .map((id) => {
                  const a = getActive(id);
                  return `<div class="mix-slot"><span>${a.emoji}</span>${esc(a.name)}<button data-remove="${id}" aria-label="Убрать">✕</button></div>`;
                })
                .join('')
            : '<p class="empty-note">Пока пусто. Выберите активы ниже.</p>'
        }
      </div>

      ${state.mix.length >= 2 ? comboResult(result) : ''}
      ${state.mix.length >= 2 ? `<div class="section-title"><h2>Порядок нанесения</h2></div>${routineView(routine(state.mix))}` : ''}

      <div>
        <div class="section-title"><h2>Добавить актив</h2></div>
        <div class="chips">
          ${rest.map((a) => `<button class="chip" data-add="${a.id}">${a.emoji} ${esc(a.name)}</button>`).join('')}
        </div>
      </div>
    </div>`;
}

/* ---------------- Рендер ---------------- */

const SCREENS = { home: homeScreen, catalog: catalogScreen, scan: scanScreen, mix: mixScreen };

function render({ keepScroll = false } = {}) {
  const top = view.scrollTop;
  scanner?.stop();
  scanner = null;
  view.innerHTML = SCREENS[state.tab]();
  $$('#tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
  view.scrollTop = keepScroll ? top : 0;
  if (state.tab === 'scan') initScanner();
  syncShelfButtons();
}

function go(tab) {
  state.tab = tab;
  history.replaceState(null, '', `?tab=${tab}`);
  render();
}

/* ---------------- Карточка актива ---------------- */

function openDetail(id) {
  const a = getActive(id);
  if (!a) return;
  sheetBody.innerHTML = `<div class="sl-detail">${activeDetail(a)}</div>
    <button class="btn-primary" style="width:100%;margin-top:18px" data-add="${a.id}">Добавить в проверку сочетаний</button>`;
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
  $$('[data-shelf]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(state.profile.shelf.includes(btn.dataset.shelf)));
  });
}

/* ---------------- Сканер ---------------- */

function initScanner() {
  const video = $('#video');
  const canvas = $('#canvas');
  const hint = $('#hint');
  const stage = $('#stage');

  scanner = createScanner({
    video,
    canvas,
    onStatus: (kind, text) => {
      hint.textContent = text;
      stage.classList.toggle('is-scanning', kind === 'scanning');
      $('#shot').disabled = kind === 'scanning' || kind === 'loading';
    },
    onResult: (res) => {
      state.scan = res;
      render();
      toast('Демо-распознавание: подставлен товар из каталога');
    },
  });

  scanner.start();
  $('#shot').addEventListener('click', () => scanner.capture());
  $('#pickFile').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', (e) => scanner.fromFile(e.target.files[0]));
}

/* ---------------- События ---------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

  const tab = t.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);

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
    closeSheet();
    return go('mix');
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
    state.skin = state.profile.skin;
    return render({ keepScroll: true });
  }

  if (t.closest('[data-clear-skin]')) {
    state.profile = saveProfile({ skin: null });
    state.skin = null;
    return render({ keepScroll: true });
  }

  const concern = t.closest('[data-concern]');
  if (concern) {
    const id = concern.dataset.concern || null;
    state.concern = state.concern === id ? null : id;
    state.query = '';
    if (state.tab !== 'catalog') return go('catalog');
    return render({ keepScroll: true });
  }

  const card = t.closest('[data-active]');
  if (card) return openDetail(card.dataset.active);

  const product = t.closest('[data-product]');
  if (product) {
    const found = PRODUCTS.find((p) => p.id === product.dataset.product);
    if (found) {
      found.actives.forEach((id) => !state.mix.includes(id) && state.mix.push(id));
      toast(`${found.brand}: активы добавлены в проверку`);
      return go('mix');
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  clearTimeout(document._d);
  document._d = setTimeout(() => {
    if (state.tab !== 'catalog') {
      state.tab = 'catalog';
      render();
      const input = $('#q');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    } else {
      const pos = e.target.selectionStart;
      render({ keepScroll: true });
      const input = $('#q');
      input?.focus();
      input?.setSelectionRange(pos, pos);
    }
  }, 220);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  if (e.key === 'Enter' && e.target.matches?.('[data-active]')) openDetail(e.target.dataset.active);
});

state.skin = state.profile.skin;
render();
registerSW();
setupInstall($('#install'), { onHint: toast });
