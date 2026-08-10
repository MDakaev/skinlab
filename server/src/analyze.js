/**
 * Сервис анализа: из набора активов (продукт или произвольный состав) + профиля кожи
 * собирает готовый вердикт для фронта — для чего, сочетания, порядок нанесения,
 * противопоказания и персональные предупреждения.
 */
import {
  getActive,
  activePublic,
  checkCombo,
  routine,
  CONCERNS,
  SKIN_VERDICT,
  PREGNANCY_LABEL,
  LEVELS,
} from './knowledge.js';
import { MEDICAL_DISCLAIMER } from '../../public/shared/guide.js';

const concernLabel = (id) => CONCERNS.find((c) => c.id === id)?.label || id;

/** Персональные пометки для одного актива под конкретный профиль. */
function personalize(active, profile) {
  const notes = [];
  const flags = [];

  if (profile.skin) {
    const verdict = active.skin?.[profile.skin];
    if (verdict) {
      const v = SKIN_VERDICT[verdict];
      notes.push({ kind: 'skin', tone: v.tone, text: `${v.text} для вашего типа кожи` });
      if (verdict === 'avoid' || verdict === 'caution') flags.push('skin');
    }
  }

  if (profile.pregnant && active.pregnancy && active.pregnancy !== 'yes') {
    const p = PREGNANCY_LABEL[active.pregnancy];
    notes.push({ kind: 'pregnancy', tone: p.tone, text: p.text });
    flags.push('pregnancy');
  }

  const matched = (active.concerns || []).filter((c) => (profile.concerns || []).includes(c));
  if (matched.length) {
    notes.push({ kind: 'concern', tone: 'good', text: `Работает с вашими целями: ${matched.map(concernLabel).join(', ')}` });
  }

  return { notes, flags };
}

/**
 * @param {string[]} activeIds
 * @param {{ skin?: string|null, concerns?: string[], pregnant?: boolean }} profile
 */
export function analyzeActives(activeIds, profile = {}) {
  const ids = [...new Set(activeIds)].filter((id) => getActive(id));
  const combo = checkCombo(ids);
  const order = routine(ids);

  const actives = ids.map((id) => {
    const a = getActive(id);
    return { ...activePublic(a), personal: personalize(a, profile) };
  });

  const benefits = [...new Set(actives.flatMap((a) => a.benefits || []))];
  const concernIds = [...new Set(actives.flatMap((a) => a.concerns || []))];
  const goodFor = concernIds.map((id) => ({ id, label: concernLabel(id) }));

  const contraindications = [...new Set(actives.flatMap((a) => a.avoid || []))];

  const pregnancyBlocked = actives.filter((a) => a.pregnancy === 'no').map((a) => a.name);
  const pregnancyCaution = actives.filter((a) => a.pregnancy === 'caution').map((a) => a.name);

  const skinWarnings = profile.skin
    ? actives
        .filter((a) => ['avoid', 'caution'].includes(a.skin?.[profile.skin]))
        .map((a) => ({ active: a.name, verdict: a.skin[profile.skin], text: SKIN_VERDICT[a.skin[profile.skin]].text }))
    : [];

  const serialize = (arr) => arr.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }));

  return {
    disclaimer: MEDICAL_DISCLAIMER.long,
    actives,
    summary: {
      count: actives.length,
      benefits,
      goodFor,
      irritationLoad: combo.irritation,
    },
    combo: {
      verdict: combo.verdict,
      pairs: combo.pairs.map((p) => ({
        a: { id: p.a.id, name: p.a.name, emoji: p.a.emoji },
        b: { id: p.b.id, name: p.b.name, emoji: p.b.emoji },
        level: p.level,
        label: LEVELS[p.level]?.label,
        why: p.why,
      })),
    },
    routine: {
      am: serialize(order.am),
      pm: serialize(order.pm),
      conflicting: [...order.conflicting],
    },
    contraindications,
    personalWarnings: {
      pregnancyBlocked,
      pregnancyCaution: profile.pregnant ? pregnancyCaution : [],
      skin: skinWarnings,
    },
  };
}
