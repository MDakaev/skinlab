/**
 * Разбор состава (INCI) и сопоставление ингредиентов со справочником активов.
 *
 * Это эвристический матчер, а не полноценный INCI-резолвер: он ищет известные
 * названия активов и их синонимы в списке ингредиентов с этикетки. Такого уровня
 * достаточно, чтобы по составу продукта показать «для чего он» и его сочетания.
 */
import { ACTIVES } from '../../public/shared/engine.js';

const norm = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[|•]/g, ',')
    .replace(/[^a-zа-я0-9%+\-,./() ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ручные синонимы INCI для активов из справочника.
 * Ключ — id актива, значения — фрагменты, которые встречаются на этикетках.
 */
const MANUAL_ALIASES = {
  retinol: ['retinol', 'retinyl', 'granactive retinoid', 'hydroxypinacolone retinoate'],
  retinal: ['retinaldehyde', 'retinal'],
  adapalene: ['adapalene'],
  bakuchiol: ['bakuchiol', 'psoralea corylifolia'],
  vitc: ['ascorbic acid', 'l-ascorbic acid'],
  'vitc-derivative': [
    'ascorbyl',
    'sodium ascorbyl phosphate',
    'magnesium ascorbyl phosphate',
    'tetrahexyldecyl ascorbate',
    'ethyl ascorbic acid',
    'ascorbyl glucoside',
  ],
  niacinamide: ['niacinamide', 'nicotinamide'],
  azelaic: ['azelaic acid', 'potassium azeloyl diglycinate'],
  aha: ['glycolic acid', 'lactic acid', 'mandelic acid', 'citric acid', 'tartaric acid', 'malic acid'],
  bha: ['salicylic acid', 'betaine salicylate', 'capryloyl salicylic acid'],
  pha: ['gluconolactone', 'lactobionic acid', 'galactose'],
  bp: ['benzoyl peroxide'],
  tranexamic: ['tranexamic acid', 'cetyl tranexamate'],
  arbutin: ['arbutin', 'alpha-arbutin', 'beta-arbutin'],
  ha: ['hyaluronic acid', 'sodium hyaluronate', 'hydrolyzed hyaluronic acid', 'sodium acetylated hyaluronate'],
  ceramides: ['ceramide', 'ceramide np', 'ceramide ap', 'ceramide eop'],
  peptides: [
    'palmitoyl',
    'acetyl hexapeptide',
    'copper tripeptide',
    'matrixyl',
    'argireline',
    'palmitoyl tripeptide',
    'palmitoyl pentapeptide',
  ],
  panthenol: ['panthenol', 'pantothenic acid', 'provitamin b5'],
  cica: ['centella asiatica', 'madecassoside', 'asiaticoside', 'madecassic acid', 'asiatic acid'],
  urea: ['urea'],
  zinc: ['zinc pca', 'zinc gluconate'],
  spf: [
    'zinc oxide',
    'titanium dioxide',
    'octocrylene',
    'avobenzone',
    'homosalate',
    'ethylhexyl methoxycinnamate',
    'bis-ethylhexyloxyphenol methoxyphenyl triazine',
    'tinosorb',
    'uvinul',
    'bemotrizinol',
  ],
  squalane: ['squalane', 'squalene'],
  vite: ['tocopherol', 'tocopheryl acetate', 'vitamin e'],
};

/** Раскладывает поле `inci` актива (со слэшами/скобками) на отдельные фрагменты. */
function aliasesFromInci(inci) {
  return norm(inci)
    .split(/[,/]/)
    .map((s) => s.replace(/\(.*?\)/g, ' ').replace(/\d+([.,]\d+)?%?/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 3);
}

/** Итоговая таблица: id актива → отсортированный список уникальных синонимов. */
const ALIASES = (() => {
  const table = new Map();
  for (const a of ACTIVES) {
    const set = new Set([...(MANUAL_ALIASES[a.id] || []), ...aliasesFromInci(a.inci)].map(norm).filter(Boolean));
    table.set(a.id, [...set].sort((x, y) => y.length - x.length));
  }
  return table;
})();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Разбивает строку состава на отдельные ингредиенты. */
export function parseIngredients(text) {
  const n = norm(text);
  if (!n) return [];
  return n
    .split(',')
    .map((s) => s.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Находит активы из справочника в тексте состава.
 * Возвращает [{ active_id, evidence }], где evidence — фрагмент, который совпал.
 */
export function matchActives(ingredientsText) {
  const n = norm(ingredientsText);
  if (!n) return [];
  const hits = new Map();

  for (const [activeId, aliases] of ALIASES) {
    for (const alias of aliases) {
      const re = new RegExp(`(^|[^a-zа-я])${escapeRe(alias)}([^a-zа-я]|$)`, 'i');
      if (re.test(n)) {
        if (!hits.has(activeId)) hits.set(activeId, alias);
        break;
      }
    }
  }

  return [...hits.entries()].map(([active_id, evidence]) => ({ active_id, evidence }));
}

/** Экспорт таблицы синонимов — удобно для отладки и тестов. */
export function aliasTable() {
  return Object.fromEntries(ALIASES);
}
