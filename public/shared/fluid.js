/**
 * Fluid drawers: spring open/close, drag-to-dismiss with velocity handoff.
 * Follows Apple-style interruptible motion (WWDC Designing Fluid Interfaces).
 */

const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Exponential deceleration projection (Apple sample). */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Spring from current → target. Interruptible: call again with a new target;
 * cancel() stops the previous run without jumping.
 */
export function springTo({
  from,
  to,
  velocity = 0,
  stiffness = 280,
  damping = 32,
  mass = 1,
  restDelta = 0.4,
  restVelocity = 0.05,
  onUpdate,
  onComplete,
}) {
  let x = from;
  let v = velocity;
  let frame = 0;
  let last = performance.now();
  let alive = true;

  const tick = (now) => {
    if (!alive) return;
    const dt = Math.min(0.032, (now - last) / 1000) || 0.016;
    last = now;

    const spring = -stiffness * (x - to);
    const damper = -damping * v;
    const a = (spring + damper) / mass;
    v += a * dt;
    x += v * dt;

    onUpdate?.(x, v);

    if (Math.abs(v) < restVelocity && Math.abs(x - to) < restDelta) {
      onUpdate?.(to, 0);
      onComplete?.(to);
      alive = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return {
    cancel() {
      alive = false;
      cancelAnimationFrame(frame);
    },
    get value() {
      return x;
    },
    get velocity() {
      return v;
    },
  };
}

/**
 * Bottom drawer controller for .sheet / .overlay roots.
 * @param {HTMLElement} root
 * @param {{ onClose?: () => void }} [opts]
 */
export function createDrawer(root, { onClose } = {}) {
  const scrim = root.querySelector('[class$="__scrim"]');
  const panel = root.querySelector('[class$="__panel"]');
  if (!scrim || !panel) throw new Error('createDrawer: missing scrim/panel');

  let y = 0;
  let open = false;
  let anim = null;
  let drag = null;

  const setVisual = (ty, progress) => {
    y = ty;
    const p = Math.max(0, Math.min(1, progress));
    panel.style.transform = `translate3d(0, ${ty}px, 0)`;
    scrim.style.opacity = String(p);
    root.style.setProperty('--drawer-progress', String(p));
  };

  const panelHeight = () => panel.getBoundingClientRect().height || window.innerHeight * 0.9;

  const settleOpen = (velocity = 0) => {
    anim?.cancel();
    if (REDUCED()) {
      setVisual(0, 1);
      anim = null;
      return;
    }
    anim = springTo({
      from: y,
      to: 0,
      velocity,
      stiffness: 320,
      damping: 34,
      onUpdate: (val) => {
        const h = panelHeight();
        setVisual(val, 1 - val / h);
      },
      onComplete: () => {
        setVisual(0, 1);
        anim = null;
      },
    });
  };

  const settleClose = (velocity = 0) => {
    anim?.cancel();
    const h = panelHeight();
    const finish = () => {
      setVisual(h, 0);
      root.hidden = true;
      root.classList.remove('is-open');
      panel.style.transform = '';
      scrim.style.opacity = '';
      open = false;
      anim = null;
      onClose?.();
    };

    if (REDUCED()) {
      finish();
      return;
    }

    anim = springTo({
      from: y,
      to: h,
      velocity: Math.max(velocity, 400),
      stiffness: 260,
      damping: 36,
      onUpdate: (val) => setVisual(val, 1 - val / h),
      onComplete: finish,
    });
  };

  const show = () => {
    if (open && !root.hidden) {
      anim?.cancel();
      setVisual(0, 1);
      return;
    }
    anim?.cancel();
    open = true;
    root.hidden = false;
    root.classList.add('is-open');
    // Layout must exist before we measure height for the spring.
    void panel.offsetHeight;
    if (REDUCED()) {
      setVisual(0, 1);
      return;
    }
    const h = panelHeight();
    setVisual(Math.max(120, h * 0.22), 0);
    settleOpen(0);
  };

  const hide = () => {
    if (!open && root.hidden) return;
    open = true; // keep interactive until settle finishes
    settleClose(0);
  };

  const onPointerDown = (e) => {
    if (!open || e.button) return;
    // Don't steal clicks from close / CTA controls in the top chrome.
    if (e.target.closest('button, a, input, select, textarea, label')) return;

    // Drag from the handle, or pull down when the panel is scrolled to the top.
    const handleZone = Boolean(e.target.closest('[data-drawer-handle]'));
    const fromTop = e.clientY - panel.getBoundingClientRect().top < 56;
    const atTop = panel.scrollTop <= 0;
    if (!handleZone && !(atTop && fromTop)) return;

    anim?.cancel();
    anim = null;

    const startY = e.clientY;
    const origin = y;
    const samples = [];
    drag = { id: e.pointerId, startY, origin, samples, active: false, handleZone };

    panel.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dy) < 10) return;
      // Commit only to downward dismiss; upward restores scroll.
      if (dy < 0) {
        drag = null;
        try {
          panel.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      drag.active = true;
      panel.classList.add('is-dragging');
    }

    const h = panelHeight();
    const next = dy > 0 ? drag.origin + dy : drag.origin + rubberband(dy, h);
    const progress = 1 - next / h;
    setVisual(Math.max(0, next), progress);
    drag.samples.push({ t: performance.now(), y: next });
    if (drag.samples.length > 5) drag.samples.shift();
  };

  const velocityFrom = (samples) => {
    if (samples.length < 2) return 0;
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    return (b.y - a.y) / dt;
  };

  const onPointerUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    panel.classList.remove('is-dragging');
    const wasDragging = drag.active;
    const vel = velocityFrom(drag.samples);
    drag = null;

    if (!wasDragging) return;

    const h = panelHeight();
    const projected = y + project(vel);
    const shouldClose = vel > 900 || projected > h * 0.28 || y > h * 0.22;

    if (shouldClose) settleClose(Math.max(vel, 600));
    else settleOpen(vel);
  };

  panel.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('pointercancel', onPointerUp);

  return {
    open: show,
    close: hide,
    get isOpen() {
      return open && !root.hidden;
    },
    destroy() {
      anim?.cancel();
      panel.removeEventListener('pointerdown', onPointerDown);
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerup', onPointerUp);
      panel.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
