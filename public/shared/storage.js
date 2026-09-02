/**
 * Abstraction над хранением профиля и полки.
 * Сейчас — localStorage. Позже можно заменить на API (Telegram ID → SkinLab).
 */

const PROFILE_KEY = 'skinlab.profile.v1';

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

export function getProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return normalizeProfile(raw);
  } catch {
    return { ...PROFILE_DEFAULTS };
  }
}

export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
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
  localStorage.removeItem(PROFILE_KEY);
  return { ...PROFILE_DEFAULTS };
}

export const STORAGE_KEYS = { profile: PROFILE_KEY };
