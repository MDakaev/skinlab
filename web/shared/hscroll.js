/**
 * Горизонтальные ленты: под лентой рисуется своя полоса прокрутки со стрелками.
 * Управление вынесено под контент, поэтому ничего не перекрывает текст.
 * Полоса появляется только когда лента реально не влезает в ширину.
 */

const TRACK_SELECTOR = '.chips, .rail-scroll, .pillnav, .nav, [data-hscroll]';

const CHEVRON_LEFT = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6-6 6 6 6"/></svg>`;
const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 6 6 6-6 6"/></svg>`;

/**
 * Добавляет полосу прокрутки со стрелками всем горизонтальным лентам внутри root.
 * Безопасно вызывать после каждого render(): обработанные узлы пропускаются.
 * @param {ParentNode} [root]
 */
export function enhanceHScroll(root = document) {
  root.querySelectorAll(TRACK_SELECTOR).forEach(enhanceTrack);
}

function enhanceTrack(track) {
  if (track.dataset.hscrollReady === '1') return;
  track.dataset.hscrollReady = '1';
  if (track.closest('.sl-hscroll')) return;

  const wrap = document.createElement('div');
  wrap.className = 'sl-hscroll';
  track.parentNode.insertBefore(wrap, track);
  track.classList.add('sl-hscroll__track');
  wrap.appendChild(track);

  const bar = document.createElement('div');
  bar.className = 'sl-hscroll__bar';
  bar.innerHTML = `
    <button type="button" class="sl-hscroll__arrow" data-dir="-1" aria-label="Листать влево">${CHEVRON_LEFT}</button>
    <div class="sl-hscroll__rail"><span class="sl-hscroll__thumb"></span></div>
    <button type="button" class="sl-hscroll__arrow" data-dir="1" aria-label="Листать вправо">${CHEVRON_RIGHT}</button>`;
  wrap.appendChild(bar);

  const rail = bar.querySelector('.sl-hscroll__rail');
  const thumb = bar.querySelector('.sl-hscroll__thumb');
  const [prev, next] = bar.querySelectorAll('.sl-hscroll__arrow');

  const sync = () => syncBar(wrap, track, thumb, prev, next);

  bar.querySelectorAll('.sl-hscroll__arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = Math.max(140, Math.round(track.clientWidth * 0.72));
      track.scrollBy({ left: Number(btn.dataset.dir) * step, behavior: 'smooth' });
    });
  });

  track.addEventListener('scroll', sync, { passive: true });
  setupThumbDrag(rail, thumb, track);

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    ro.observe(track);
  }

  // Размеры становятся известны на следующем кадре после вставки в DOM.
  requestAnimationFrame(sync);
}

/** Перетаскивание ползунка и клик по рельсе — как у обычного скроллбара. */
function setupThumbDrag(rail, thumb, track) {
  let dragging = false;

  const scrollToPointer = (clientX) => {
    const railBox = rail.getBoundingClientRect();
    const thumbW = thumb.offsetWidth;
    const usable = railBox.width - thumbW;
    if (usable <= 0) return;
    const ratio = (clientX - railBox.left - thumbW / 2) / usable;
    const max = track.scrollWidth - track.clientWidth;
    track.scrollLeft = Math.min(Math.max(ratio, 0), 1) * max;
  };

  thumb.addEventListener('pointerdown', (e) => {
    dragging = true;
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', (e) => {
    if (dragging) scrollToPointer(e.clientX);
  });
  thumb.addEventListener('pointerup', () => {
    dragging = false;
  });
  thumb.addEventListener('pointercancel', () => {
    dragging = false;
  });

  rail.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    scrollToPointer(e.clientX);
  });
}

function syncBar(wrap, track, thumb, prev, next) {
  const max = track.scrollWidth - track.clientWidth;
  const overflow = max > 4;
  wrap.classList.toggle('is-overflow', overflow);
  if (!overflow) return;

  const ratio = track.clientWidth / track.scrollWidth;
  const progress = max > 0 ? track.scrollLeft / max : 0;

  thumb.style.width = `${Math.max(ratio * 100, 14)}%`;
  thumb.style.left = `${progress * (100 - Math.max(ratio * 100, 14))}%`;

  prev.disabled = track.scrollLeft <= 2;
  next.disabled = track.scrollLeft >= max - 2;
}
