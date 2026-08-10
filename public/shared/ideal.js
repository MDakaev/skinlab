/**
 * Идеальный уход: из настроек профиля собирается конкретная рутина.
 *
 * Вход — тип кожи, задачи, беременность и опыт («кожа привыкла» или нет).
 * Выход — два списка шагов (утро и вечер), где каждый шаг это либо базовый
 * пункт (очищение, крем, SPF), либо подобранный актив с объяснением, почему он тут.
 *
 * Правила отбора:
 *  1. Базовый уход не обсуждается: очищение → крем → SPF есть всегда.
 *  2. Активы, противопоказанные типу кожи ('avoid'), не предлагаются никогда.
 *  3. При беременности активы с pregnancy:'no' и 'caution' не предлагаются автоматически.
 *     В набор попадают только те, что обычно считают допустимыми (pregnancy:'yes'), и то с оговоркой врача.
 *  4. Лекарственные препараты не назначаются автоматически, только упоминаются.
 *  5. Число активов ограничено: перегруженная рутина хуже короткой.
 *  6. Пара с вердиктом 'avoid' в один набор не попадает.
 */
import { CONCERNS, SKIN_TYPES, getActive, getPair } from './engine.js';
import { timesPerWeek } from './schedule.js';
import { MOISTURIZER_BY_SKIN } from './guide.js';

/** Кандидаты под каждую задачу, от самого доказанного к запасному. */
const BY_CONCERN = {
  acne: ['bha', 'azelaic', 'niacinamide', 'retinal', 'bp', 'zinc'],
  pigmentation: ['vitc', 'tranexamic', 'azelaic', 'arbutin', 'niacinamide', 'retinol'],
  wrinkles: ['retinol', 'retinal', 'peptides', 'bakuchiol', 'vitc'],
  pores: ['bha', 'niacinamide', 'zinc', 'retinol'],
  redness: ['azelaic', 'cica', 'niacinamide', 'panthenol'],
  dehydration: ['ha', 'panthenol', 'urea', 'pha'],
  texture: ['aha', 'pha', 'retinal', 'urea'],
  dullness: ['vitc', 'vitc-derivative', 'aha', 'pha'],
  barrier: ['ceramides', 'panthenol', 'cica', 'squalane'],
};

/** Если задачи не выбраны — собираем спокойный уход общего назначения. */
const DEFAULT_CONCERNS = ['dehydration', 'barrier'];

/** Группы, из которых в рутине может быть только один представитель. */
const EXCLUSIVE_GROUPS = {
  retinol: 'retinoid',
  retinal: 'retinoid',
  adapalene: 'retinoid',
  bakuchiol: 'retinoid',
  aha: 'exfoliant',
  bha: 'exfoliant',
  pha: 'exfoliant',
  vitc: 'antioxidant',
  'vitc-derivative': 'antioxidant',
};

/** Сколько активов сверх базы уместно за раз. */
const LIMITS = {
  start: { count: 2, irritation: 6 },
  adapted: { count: 3, irritation: 11 },
};

const CLEANSER_BY_SKIN = {
  dry: 'Молочко или крем-гель без сульфатов, тёплая (не горячая) вода. Утром можно ограничиться водой.',
  oily: 'Гель для умывания дважды в день. Ощущение «скрипучей чистоты» — признак, что средство слишком агрессивное.',
  combo: 'Мягкий гель вечером, лёгкое умывание утром. Т-зону не тереть отдельно щёткой.',
  normal: 'Мягкий гель или пенка дважды в день.',
  sensitive: 'Мицеллярная вода или очень мягкий гель без отдушек, один раз в день — вечером.',
};

const SPF_BY_SKIN = {
  dry: 'Кремовая текстура SPF 50, два пальца на лицо и шею.',
  oily: 'Матирующий флюид или гель SPF 50 — плотные кремовые санскрины дают закупорки.',
  combo: 'Флюид SPF 50, при сухости щёк — кремовый поверх крема.',
  normal: 'Любая текстура SPF 30–50, которую комфортно наносить в нужном количестве.',
  sensitive: 'Минеральный SPF 50 на оксиде цинка, без спирта и отдушек.',
};

const skinLabel = (id) => SKIN_TYPES.find((t) => t.id === id)?.label || '';
const concernLabel = (id) => CONCERNS.find((c) => c.id === id)?.label || id;

/**
 * @param {object} profile — { skin, concerns, pregnant, experience }
 */
export function idealRoutine(profile = {}) {
  const skin = profile.skin || null;
  const experience = profile.experience === 'adapted' ? 'adapted' : 'start';
  const pregnant = Boolean(profile.pregnant);
  const chosen = Array.isArray(profile.concerns) ? profile.concerns.filter((c) => BY_CONCERN[c]) : [];
  const usingDefaults = chosen.length === 0;
  const concerns = usingDefaults ? DEFAULT_CONCERNS : chosen;

  const limits = { ...LIMITS[experience] };
  // Чувствительной коже одновременно даём на один актив меньше.
  if (skin === 'sensitive') {
    limits.count = Math.max(1, limits.count - 1);
    limits.irritation = Math.min(limits.irritation, 5);
  }

  const scored = scoreCandidates(concerns);
  const excluded = [];
  const picks = [];
  const usedGroups = new Set();
  let irritation = 0;

  for (const item of scored) {
    const a = item.active;

    if (a.base) continue;

    if (a.drug) {
      excluded.push({ active: a, tone: 'ok', why: 'Лекарственный препарат — назначает врач, автоматически в рутину не ставим.' });
      continue;
    }

    if (skin && a.skin[skin] === 'avoid') {
      excluded.push({ active: a, tone: 'bad', why: `Не рекомендуется для вашего типа кожи (${skinLabel(skin).toLowerCase()}).` });
      continue;
    }

    if (skin && a.skin[skin] === 'caution' && experience === 'start') {
      excluded.push({ active: a, tone: 'warn', why: `Для вашего типа кожи — с осторожностью. Вернём его, когда кожа привыкнет к активам.` });
      continue;
    }

    if (pregnant && a.pregnancy === 'no') {
      excluded.push({ active: a, tone: 'bad', why: 'Не применяют при беременности и лактации.' });
      continue;
    }

    if (pregnant && a.pregnancy === 'caution') {
      excluded.push({
        active: a,
        tone: 'warn',
        why: 'Данных по беременности недостаточно или есть оговорки по площади/концентрации. Автоматически не предлагаем — только после согласования с врачом.',
      });
      continue;
    }

    const group = EXCLUSIVE_GROUPS[a.id];
    if (group && usedGroups.has(group)) {
      excluded.push({ active: a, tone: 'ok', why: 'В рутине уже есть актив той же группы — двух сразу не нужно.' });
      continue;
    }

    const clash = picks.find((p) => getPair(p.active.id, a.id)?.level === 'avoid');
    if (clash) {
      excluded.push({ active: a, tone: 'warn', why: `Конфликтует с активом «${clash.active.name}», который подошёл лучше.` });
      continue;
    }

    if (picks.length >= limits.count || irritation + a.irritation > limits.irritation) {
      excluded.push({ active: a, tone: 'ok', why: 'Не поместился в набор: больше активов сразу — больше раздражения, а не результата.' });
      continue;
    }

    picks.push({
      active: a,
      matched: item.matched,
      why: reasonFor(a, item.matched),
      pregnancyWarning: false,
      skinWarning: skin ? a.skin[skin] === 'caution' : false,
    });
    if (group) usedGroups.add(group);
    irritation += a.irritation;
  }

  const support = supportFor({ skin, picks });
  const all = [...picks, ...support];
  const ids = ['moisturizer', 'spf', ...all.map((p) => p.active.id)];

  return {
    ready: Boolean(skin),
    skin,
    skinLabel: skinLabel(skin),
    experience,
    pregnant,
    concerns,
    usingDefaults,
    picks,
    support,
    excluded: dedupeExcluded(excluded, all),
    ids,
    am: buildSteps('AM', all, { skin, experience }),
    pm: buildSteps('PM', all, { skin, experience }),
    notes: buildNotes({ skin, pregnant, experience, picks, concerns, usingDefaults }),
  };
}

/** Балл кандидата: чем выше в списке задачи и чем больше задач закрывает, тем раньше он в очереди. */
function scoreCandidates(concerns) {
  const table = new Map();

  for (const concern of concerns) {
    const list = BY_CONCERN[concern] || [];
    list.forEach((id, index) => {
      const active = getActive(id);
      if (!active) return;
      const entry = table.get(id) || { active, score: 0, matched: [] };
      entry.score += list.length - index;
      entry.matched.push(concern);
      table.set(id, entry);
    });
  }

  return [...table.values()].sort(
    (a, b) => b.matched.length - a.matched.length || b.score - a.score || a.active.irritation - b.active.irritation
  );
}

/** «2 раза в неделю» вместо «наносите по инструкции»: частота — половина ответа. */
function frequencyLabel(active, experience) {
  const times = timesPerWeek(active, experience);
  if (times >= 7) return 'каждый день';
  const noun = times >= 2 && times <= 4 ? 'раза' : 'раз';
  return `${times} ${noun} в неделю`;
}

function reasonFor(active, matched) {
  const tasks = matched.map((c) => concernLabel(c).toLowerCase()).join(', ');
  return `Закрывает: ${tasks}. ${active.tagline}.`;
}

/** Поддержка барьера: то, что делает рутину переносимой, а не «эффективной на бумаге». */
function supportFor({ skin, picks }) {
  const has = (id) => picks.some((p) => p.active.id === id);
  const out = [];
  const add = (id, why) => {
    const active = getActive(id);
    if (!active || has(id) || out.some((o) => o.active.id === id)) return;
    if (skin && active.skin[skin] === 'avoid') return;
    out.push({ active, why, support: true, matched: [] });
  };

  const harsh = picks.filter((p) => p.active.needsMoisturizer || p.active.irritation >= 3);
  if (harsh.length) {
    add('ceramides', `Поддержка барьера: он страдает от таких активов, как ${harsh.map((p) => p.active.name).join(', ')}. Церамиды возвращают липиды, которые те вымывают.`);
  }

  if (skin === 'dry' || skin === 'sensitive') {
    add('panthenol', 'Успокаивающий слой для реактивной и сухой кожи — особенно в дни после активов.');
  }

  if (skin === 'dry') add('ha', 'Дополнительная вода в роговом слое: наносится на влажную кожу, сверху — крем.');

  return out;
}

/** Один и тот же актив не должен одновременно быть в наборе и в списке исключённых. */
function dedupeExcluded(excluded, picks) {
  const inRoutine = new Set(picks.map((p) => p.active.id));
  const seen = new Set();
  return excluded.filter((e) => {
    if (inRoutine.has(e.active.id) || seen.has(e.active.id)) return false;
    seen.add(e.active.id);
    return true;
  });
}

/**
 * Сборка шагов: базовые пункты плюс подобранные активы в порядке слоёв.
 * @param {'AM'|'PM'} time
 */
function buildSteps(time, picks, { skin, experience }) {
  const fits = (a) => a.time === time || a.time === 'ANY';
  const actives = picks
    .map((p) => ({ ...p, active: p.active }))
    .filter((p) => fits(p.active))
    .sort((a, b) => a.active.layer - b.active.layer);

  const steps = [
    {
      id: 'cleanse',
      icon: 'cleanse',
      title: 'Очищение',
      text: CLEANSER_BY_SKIN[skin] || CLEANSER_BY_SKIN.normal,
    },
    ...actives.map((p) => ({
      id: p.active.id,
      icon: null,
      active: p.active,
      title: p.active.name,
      text: p.why,
      frequency: frequencyLabel(p.active, experience),
      support: Boolean(p.support),
      pregnancyWarning: Boolean(p.pregnancyWarning),
      skinWarning: Boolean(p.skinWarning),
    })),
    {
      id: 'moisturizer',
      icon: 'cream',
      active: getActive('moisturizer'),
      title: 'Увлажняющий крем',
      text: MOISTURIZER_BY_SKIN[skin] || MOISTURIZER_BY_SKIN.normal,
      frequency: 'каждый день',
      required: true,
    },
  ];

  if (time === 'AM') {
    steps.push({
      id: 'spf',
      icon: 'sun',
      active: getActive('spf'),
      title: 'SPF 30–50',
      text: SPF_BY_SKIN[skin] || SPF_BY_SKIN.normal,
      frequency: 'каждое утро',
      required: true,
    });
  }

  return steps.map((s, i) => ({ ...s, step: i + 1 }));
}

function buildNotes({ skin, pregnant, experience, picks, concerns, usingDefaults }) {
  const notes = [];

  if (!skin) {
    notes.push({
      tone: 'warn',
      text: 'Тип кожи не выбран — уход собран по общим правилам. Пройдите тест в профиле, и подбор станет точнее.',
    });
  }

  if (usingDefaults) {
    notes.push({
      tone: 'ok',
      text: 'Задачи не отмечены, поэтому собран базовый уход: очищение, увлажнение, барьер и защита. Отметьте задачи — добавим активы под них.',
    });
  }

  if (pregnant) {
    notes.push({
      tone: 'warn',
      text: 'Учтена беременность: ретиноиды, бакучиол и активы с неясным профилем безопасности исключены. Обычно оставляют ниацинамид, азелаиновую кислоту, мягкое увлажнение и SPF — схему всё равно согласуйте с врачом.',
    });
  }

  if (experience === 'start' && picks.length) {
    notes.push({
      tone: 'ok',
      text: 'Режим для непривыкшей кожи: вводите активы по одному раз в 2 недели, начиная с самого мягкого, и следите за реакцией.',
    });
  }

  if (concerns.includes('acne')) {
    notes.push({
      tone: 'ok',
      text: 'При стойком воспалительном акне косметика проигрывает лекарствам: адапален, бензоилпероксид и азелаиновая 15–20% назначаются дерматологом.',
    });
  }

  if (skin === 'sensitive') {
    notes.push({
      tone: 'warn',
      text: 'Чувствительной коже сознательно оставлен минимум активов. Сначала месяц спокойного барьерного ухода, потом добавляйте по одному.',
    });
  }

  return notes;
}
