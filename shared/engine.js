import { ACTIVES, PRODUCTS, RULES, LEVELS, SKIN_TYPES, CONCERNS } from './data.js';

export { ACTIVES, PRODUCTS, RULES, LEVELS, SKIN_TYPES, CONCERNS };

const byId = new Map(ACTIVES.map((a) => [a.id, a]));
export const getActive = (id) => byId.get(id);

const ruleKey = (a, b) => [a, b].sort().join('|');
const ruleMap = new Map(RULES.map(([a, b, level, why]) => [ruleKey(a, b), { level, why }]));

const LEVEL_WEIGHT = { great: 0, ok: 1, caution: 2, avoid: 3 };

/** Совместимость двух активов. Для незаданных пар данных нет — это НЕ подтверждённая безопасность. */
export function getPair(idA, idB) {
  if (idA === idB) return null;
  const found = ruleMap.get(ruleKey(idA, idB));
  return found || { level: 'ok', assumed: true, why: 'В нашей базе нет выверенного правила для этой пары — это не значит «безопасно». Вводите новый актив по одному, следите за реакцией и при сомнениях разносите по времени.' };
}

/** Все известные связи актива, разложенные по уровням. */
export function relationsOf(id) {
  const out = { great: [], ok: [], caution: [], avoid: [] };
  for (const [a, b, level, why] of RULES) {
    if (a !== id && b !== id) continue;
    const other = a === id ? b : a;
    if (!byId.has(other)) continue;
    out[level].push({ active: byId.get(other), why });
  }
  return out;
}

/** Проверка набора активов: попарные вердикты + общий итог. */
export function checkCombo(ids) {
  const list = [...new Set(ids)].filter((id) => byId.has(id));
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const pair = getPair(list[i], list[j]);
      pairs.push({ a: byId.get(list[i]), b: byId.get(list[j]), ...pair });
    }
  }
  pairs.sort((x, y) => LEVEL_WEIGHT[y.level] - LEVEL_WEIGHT[x.level]);

  const worst = pairs.reduce((acc, p) => (LEVEL_WEIGHT[p.level] > LEVEL_WEIGHT[acc] ? p.level : acc), 'great');
  const irritation = list.reduce((sum, id) => sum + byId.get(id).irritation, 0);

  let verdict;
  if (list.length < 2) verdict = { level: 'ok', title: 'Добавьте минимум два актива', text: 'Выберите хотя бы две позиции, чтобы проверить их сочетание.' };
  else if (worst === 'avoid') verdict = { level: 'avoid', title: 'Не наносите вместе', text: 'В наборе есть конфликтующая пара. Разведите её по времени суток или по разным дням.' };
  else if (worst === 'caution') verdict = { level: 'caution', title: 'Можно, но аккуратно', text: 'Сочетание рабочее для адаптированной кожи. Начинайте с минимальной частоты.' };
  else if (irritation >= 9) verdict = { level: 'caution', title: 'Суммарная нагрузка высокая', text: 'Конфликтов нет, но общий раздражающий потенциал набора велик. Уменьшите количество активов за один вечер.' };
  else verdict = { level: 'great', title: 'Отличная комбинация', text: 'Активы работают вместе и усиливают друг друга.' };

  return { list: list.map((id) => byId.get(id)), pairs, verdict, irritation };
}

/** Порядок нанесения: от лёгких текстур к плотным, с разделением на утро и вечер. */
export function routine(ids) {
  const items = [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean);
  const conflicting = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const { level } = getPair(items[i].id, items[j].id) || {};
      if (level === 'avoid') {
        conflicting.add(items[i].id);
        conflicting.add(items[j].id);
      }
    }
  }
  const sort = (arr) => arr.slice().sort((a, b) => a.layer - b.layer);
  return {
    am: sort(items.filter((a) => a.time === 'AM' || a.time === 'ANY')),
    pm: sort(items.filter((a) => a.time === 'PM' || a.time === 'ANY')),
    conflicting,
  };
}

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9%+ ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Поиск по активам и по каталогу косметики. */
export function search(query) {
  const q = norm(query);
  if (!q) return { actives: [], products: [] };
  const tokens = q.split(' ').filter(Boolean);
  const hit = (haystack) => tokens.every((t) => norm(haystack).includes(t));

  const actives = ACTIVES.filter((a) => hit(`${a.name} ${a.inci} ${a.group} ${a.tagline}`));
  const products = PRODUCTS.filter((p) => hit(`${p.brand} ${p.name} ${p.type}`) || p.actives.some((id) => hit(byId.get(id)?.name || '')));
  return { actives, products };
}

export function filterActives({ skin = null, concern = null, group = null } = {}) {
  return ACTIVES.filter((a) => {
    if (skin && (a.skin[skin] === 'avoid' || a.skin[skin] === 'caution')) return false;
    if (concern && !a.concerns.includes(concern)) return false;
    if (group && a.group !== group) return false;
    return true;
  });
}

export const groups = () => [...new Set(ACTIVES.map((a) => a.group))];

/** Профиль пользователя в localStorage — общий для всех макетов. */
const STORE_KEY = 'skinlab.profile.v1';
const defaults = {
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

export function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      ...defaults,
      ...raw,
      concerns: Array.isArray(raw.concerns) ? raw.concerns : [],
      shelf: Array.isArray(raw.shelf) ? raw.shelf : [],
      quizAnswers: raw.quizAnswers && typeof raw.quizAnswers === 'object' ? raw.quizAnswers : {},
      dismissedTips: raw.dismissedTips && typeof raw.dismissedTips === 'object' ? raw.dismissedTips : {},
    };
  } catch {
    return { ...defaults };
  }
}

export function saveProfile(patch) {
  const next = { ...loadProfile(), ...patch };
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export function toggleShelf(id) {
  const p = loadProfile();
  const shelf = p.shelf.includes(id) ? p.shelf.filter((x) => x !== id) : [...p.shelf, id];
  return saveProfile({ shelf });
}

export function dismissTip(id) {
  const p = loadProfile();
  return saveProfile({ dismissedTips: { ...p.dismissedTips, [id]: true } });
}

export function resetProfile() {
  localStorage.removeItem(STORE_KEY);
  return { ...defaults };
}

export const PREGNANCY_LABEL = {
  yes: { text: 'Разрешён при беременности', tone: 'good' },
  caution: { text: 'При беременности — по согласованию с врачом', tone: 'warn' },
  no: { text: 'Запрещён при беременности и лактации', tone: 'bad' },
};

export const SKIN_VERDICT = {
  great: { text: 'Отлично подходит', tone: 'good' },
  ok: { text: 'Подходит', tone: 'ok' },
  caution: { text: 'С осторожностью', tone: 'warn' },
  avoid: { text: 'Не рекомендуется', tone: 'bad' },
};

export const TIME_LABEL = { AM: 'Утро', PM: 'Вечер', ANY: 'Утро и вечер' };
