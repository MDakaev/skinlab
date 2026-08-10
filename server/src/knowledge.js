/**
 * Мост к общему экспертному слою фронтенда.
 *
 * Активы, правила сочетаемости и вся логика (совместимость, порядок нанесения,
 * связи актива) уже описаны в `public/shared/`. Сервер импортирует их напрямую,
 * чтобы не держать вторую копию знаний и не расходиться с фронтом.
 *
 * Важно: `engine.js` обращается к `localStorage` только внутри функций профиля
 * (`loadProfile`/`saveProfile`), которые сервер не вызывает, поэтому импорт в Node безопасен.
 */
export {
  PRODUCTS,
  LEVELS,
  SKIN_TYPES,
  CONCERNS,
  PREGNANCY_LABEL,
  SKIN_VERDICT,
  getActive,
  relationsOf,
  checkCombo,
  routine,
} from '../../public/shared/engine.js';

import { ACTIVES } from '../../public/shared/engine.js';

/** Публичная (сериализуемая) проекция актива для API. */
export function activePublic(a) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    inci: a.inci,
    group: a.group,
    emoji: a.emoji,
    tagline: a.tagline,
    power: a.power,
    irritation: a.irritation,
    time: a.time,
    ph: a.ph,
    what: a.what,
    benefits: a.benefits,
    skin: a.skin,
    concerns: a.concerns,
    howTo: a.howTo,
    avoid: a.avoid,
    sideFx: a.sideFx,
    pregnancy: a.pregnancy,
    tip: a.tip,
  };
}

export const allActivesPublic = () => ACTIVES.map(activePublic);
