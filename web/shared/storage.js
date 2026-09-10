/**
 * Profile storage: server (D1 via Worker) is source of truth;
 * localStorage is a write-through cache for offline UX and boot before auth.
 */

const PROFILE_KEY = 'skinlab.profile.v1';
const SYNC_DEBOUNCE_MS = 1200;
/** Soft cap — profile is small; reject runaway payloads server-side too. */
const MAX_PROFILE_JSON_BYTES = 24_576;

export const PROFILE_DEFAULTS = {
  skin: null,
  concerns: [],
  /** Активы, которые женщина уже использует — из них строится план ухода. */
  shelf: [],
  pregnant: false,
  /** 'start' — кожа не адаптирована, 'adapted' — активы уже вводились. */
  experience: 'start',
  /** Первый запуск: онбординг пройден. */
  onboarded: false,
  /** Тест типа кожи пройден (даже если потом сменили тип вручную). */
  quizDone: false,
  /** Ответы квиза { questionId: optionId } — чтобы можно было перепройти. */
  quizAnswers: {},
  /** Скрытые подсказки интерфейса (id → true). */
  dismissedTips: {},
  /** Оформление: 'auto' следует за системной темой. */
  theme: 'auto',
};

let syncTimer = null;
let syncInFlight = false;
let syncQueued = false;
let flushBound = false;

function normalizeProfile(raw = {}) {
  return {
    ...PROFILE_DEFAULTS,
    ...raw,
    concerns: Array.isArray(raw.concerns) ? raw.concerns : [],
    shelf: Array.isArray(raw.shelf) ? raw.shelf : [],
    quizAnswers: raw.quizAnswers && typeof raw.quizAnswers === 'object' ? raw.quizAnswers : {},
    dismissedTips: raw.dismissedTips && typeof raw.dismissedTips === 'object' ? raw.dismissedTips : {},
  };
}

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  try {
    const override = localStorage.getItem('skinlab.api');
    if (override) return `${override.replace(/\/$/, '')}${p}`;
  } catch {
    /* ignore */
  }
  return p;
}

function initData() {
  return window.Telegram?.WebApp?.initData || '';
}

function writeLocal(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function getProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return normalizeProfile(raw);
  } catch {
    return { ...PROFILE_DEFAULTS };
  }
}

/** True if local cache has anything worth migrating / treating as real data. */
export function profileHasData(p = getProfile()) {
  const n = normalizeProfile(p);
  return Boolean(
    n.skin ||
      n.onboarded ||
      n.quizDone ||
      n.pregnant ||
      n.experience === 'adapted' ||
      (Array.isArray(n.concerns) && n.concerns.length > 0) ||
      (Array.isArray(n.shelf) && n.shelf.length > 0) ||
      (n.quizAnswers && Object.keys(n.quizAnswers).length > 0),
  );
}

/** Replace local cache with server profile (source of truth). */
export function hydrateProfile(serverProfile) {
  if (!serverProfile || typeof serverProfile !== 'object') return getProfile();
  return writeLocal(normalizeProfile(serverProfile));
}

async function putProfile(profile) {
  const data = initData();
  if (!data) return { ok: false, error: 'no_telegram' };

  const body = JSON.stringify({ initData: data, profile });
  if (body.length > MAX_PROFILE_JSON_BYTES) {
    return { ok: false, error: 'profile_too_large' };
  }

  try {
    const res = await fetch(apiUrl('/api/profile'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || 'sync_failed' };
    }
    return { ok: true, profile: json.profile || profile, updatedAt: json.updatedAt };
  } catch {
    return { ok: false, error: 'network' };
  }
}

async function runSync() {
  if (syncInFlight) {
    syncQueued = true;
    return { ok: false, error: 'busy' };
  }
  syncInFlight = true;
  syncQueued = false;
  try {
    return await putProfile(getProfile());
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      scheduleProfileSync(0);
    }
  }
}

function bindFlushOnce() {
  if (flushBound || typeof window === 'undefined') return;
  flushBound = true;
  const flush = () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    // fire-and-forget; Telegram WebView may kill the page quickly
    void putProfile(getProfile());
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Debounced server write. Pass 0 for near-immediate flush after critical saves. */
export function scheduleProfileSync(delayMs = SYNC_DEBOUNCE_MS) {
  bindFlushOnce();
  if (!initData()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync();
  }, delayMs);
}

/** Immediate sync (migrate, reset). */
export async function syncProfileNow(profile = getProfile()) {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  writeLocal(normalizeProfile(profile));
  return putProfile(getProfile());
}

/**
 * Apply auth response: server wins when present; else one-shot migrate from local.
 * @returns {object} active profile
 */
export async function applyServerProfile(serverProfile) {
  if (serverProfile && typeof serverProfile === 'object') {
    return hydrateProfile(serverProfile);
  }
  const local = getProfile();
  if (profileHasData(local) && initData()) {
    await syncProfileNow(local);
  }
  return local;
}

export function saveProfile(patch) {
  const next = normalizeProfile({ ...getProfile(), ...patch });
  writeLocal(next);
  scheduleProfileSync();
  return next;
}

export function getShelf() {
  return getProfile().shelf;
}

export function saveShelf(shelf) {
  const list = Array.isArray(shelf) ? shelf : [];
  return saveProfile({ shelf: list });
}

export function clearProfile() {
  const next = { ...PROFILE_DEFAULTS };
  writeLocal(next);
  void syncProfileNow(next);
  return next;
}

export const STORAGE_KEYS = { profile: PROFILE_KEY };
