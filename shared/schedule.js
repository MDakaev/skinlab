/**
 * Недельный план ухода.
 *
 * Задача модуля — превратить набор активов в расписание, где конфликтующие пары
 * физически не встречаются: сначала пробуем развести их по времени суток
 * (утро/вечер), а если это невозможно — по разным дням недели.
 *
 * Логика полностью детерминированная: те же активы всегда дают тот же план.
 */
import { getActive, getPair } from './engine.js';

const DAYS = [
  { id: 'mon', label: 'Пн', full: 'Понедельник' },
  { id: 'tue', label: 'Вт', full: 'Вторник' },
  { id: 'wed', label: 'Ср', full: 'Среда' },
  { id: 'thu', label: 'Чт', full: 'Четверг' },
  { id: 'fri', label: 'Пт', full: 'Пятница' },
  { id: 'sat', label: 'Сб', full: 'Суббота' },
  { id: 'sun', label: 'Вс', full: 'Воскресенье' },
];

/**
 * Сколько раз в неделю применять актив, исходя из его раздражающего потенциала.
 * `start` — кожа ещё не адаптирована (безопасный режим по умолчанию),
 * `adapted` — актив уже вводился раньше и переносится нормально.
 */
const FREQUENCY = {
  start: { 5: 2, 4: 2, 3: 3, 2: 7, 1: 7 },
  adapted: { 5: 3, 4: 4, 3: 5, 2: 7, 1: 7 },
};

/** Сколько раз в неделю уместен актив сам по себе, без учёта остального набора. */
export function timesPerWeek(active, experience = 'start') {
  const freq = FREQUENCY[experience] || FREQUENCY.start;
  return freq[active?.irritation] ?? 3;
}

const CONFLICT_LEVELS = new Set(['avoid', 'caution']);

/** Активы, после которых защита от солнца обязательна. */
const PHOTOSENSITIZING = new Set(['retinol', 'retinal', 'adapalene', 'aha', 'bha', 'pha', 'bakuchiol']);

/** Чем можно закрыть шаг увлажнения: сам крем или средство, которое его заменяет. */
const HYDRATING = new Set(['moisturizer', 'ceramides', 'squalane', 'urea']);

const byLayer = (a, b) => a.layer - b.layer;

/** Расстояние между днями по кругу недели: между Вс и Пн — один день, а не шесть. */
function circularDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, DAYS.length - diff);
}

/** Есть ли у актива конфликт с теми, кто уже стоит в этом слоте. */
function conflictIn(slotItems, active) {
  for (const placed of slotItems) {
    const pair = getPair(placed.id, active.id);
    if (pair && CONFLICT_LEVELS.has(pair.level)) return { with: placed, ...pair };
  }
  return null;
}

/**
 * @param {string[]} ids — активы, которые женщина использует
 * @param {{ experience?: 'start'|'adapted', pregnant?: boolean }} options
 */
export function weeklyPlan(ids, { experience = 'start', pregnant = false } = {}) {
  const items = [...new Set(ids)].map(getActive).filter(Boolean);
  const freq = FREQUENCY[experience] || FREQUENCY.start;

  const days = DAYS.map((d) => ({ ...d, am: [], pm: [] }));
  const separatedByTime = [];
  const rotatedByDay = [];

  // Утро — защита и антиоксиданты; вечер — всё, что работает с обновлением кожи.
  const morning = items.filter((a) => a.time === 'AM');
  const evening = items.filter((a) => a.time === 'PM');
  const anytime = items.filter((a) => a.time === 'ANY');

  // Мягкая поддержка (увлажнение, барьер) идёт каждый день и утром, и вечером.
  const supportive = anytime.filter((a) => a.irritation <= 2);
  const activeAnytime = anytime.filter((a) => a.irritation > 2);

  for (const day of days) {
    for (const a of supportive) {
      day.am.push(a);
      day.pm.push(a);
    }
    for (const a of morning) day.am.push(a);
  }

  // Фиксируем пары, которые разошлись сами собой: одна утром, другая вечером.
  for (const m of morning) {
    for (const e of evening) {
      const pair = getPair(m.id, e.id);
      if (pair && CONFLICT_LEVELS.has(pair.level)) {
        separatedByTime.push({ a: m, b: e, level: pair.level, why: pair.why });
      }
    }
  }

  // Вечерние активы распределяем по дням так, чтобы конфликтующие не совпали.
  const rotating = [...evening, ...activeAnytime].sort(
    (a, b) => b.irritation - a.irritation || b.power - a.power
  );

  for (const active of rotating) {
    const target = freq[active.irritation] ?? 3;
    const chosen = [];

    while (chosen.length < target) {
      let best = null;
      let bestScore = null;

      for (let i = 0; i < days.length; i++) {
        if (chosen.includes(i)) continue;

        const clash = conflictIn(days[i].pm, active);
        if (clash) {
          const known = rotatedByDay.some(
            (r) =>
              (r.a.id === clash.with.id && r.b.id === active.id) ||
              (r.a.id === active.id && r.b.id === clash.with.id)
          );
          if (!known) rotatedByDay.push({ a: clash.with, b: active, level: clash.level, why: clash.why });
          continue;
        }

        // Первый день — самый свободный вечер, дальше — максимально далёкий от уже занятых.
        const score = chosen.length
          ? Math.min(...chosen.map((c) => circularDistance(c, i)))
          : DAYS.length - days[i].pm.length;

        if (bestScore === null || score > bestScore) {
          best = i;
          bestScore = score;
        }
      }

      if (best === null) break;
      chosen.push(best);
      days[best].pm.push(active);
    }
  }

  for (const day of days) {
    day.am.sort(byLayer);
    day.pm.sort(byLayer);
  }

  const notes = buildNotes(items, { separatedByTime, rotatedByDay, pregnant });

  return {
    days,
    experience,
    separatedByTime,
    rotatedByDay,
    notes,
    frequency: Object.fromEntries(
      rotating.map((a) => [a.id, days.filter((d) => d.pm.some((x) => x.id === a.id)).length])
    ),
  };
}

function buildNotes(items, { separatedByTime, rotatedByDay, pregnant = false }) {
  const notes = [];
  const has = (id) => items.some((a) => a.id === id);

  if (pregnant) {
    const blocked = items.filter((a) => a.pregnancy === 'no');
    const caution = items.filter((a) => a.pregnancy === 'caution');
    if (blocked.length) {
      notes.push({
        tone: 'bad',
        text: `В наборе есть активы, которые не применяют при беременности и лактации (${blocked
          .map((a) => a.name)
          .join(', ')}). Уберите их и согласуйте уход с врачом — расписание ниже не отменяет этот запрет.`,
      });
    }
    if (caution.length) {
      notes.push({
        tone: 'warn',
        text: `${caution.map((a) => a.name).join(', ')} — при беременности только после согласования с врачом. SkinLab не назначает лечение.`,
      });
    }
  }

  const needsSpf = items.filter((a) => PHOTOSENSITIZING.has(a.id));
  if (needsSpf.length && !has('spf')) {
    notes.push({
      tone: 'bad',
      text: `В наборе есть активы, повышающие чувствительность к солнцу (${needsSpf
        .map((a) => a.name.toLowerCase())
        .join(', ')}). Без SPF утром результат обнуляется, а риск пигментации растёт.`,
    });
  }

  const drying = items.filter((a) => a.needsMoisturizer);
  if (drying.length && !items.some((a) => HYDRATING.has(a.id))) {
    notes.push({
      tone: 'bad',
      text: `В наборе нет увлажняющего крема. С такими активами, как ${drying
        .map((a) => a.name)
        .join(', ')}, он обязателен: без него барьер не восстанавливается, а это шелушение, краснота и в итоге больше высыпаний, чем было.`,
    });
  } else if (drying.length && !has('moisturizer')) {
    notes.push({
      tone: 'warn',
      text: 'Церамиды и сквалан закрывают часть задачи, но полноценный увлажняющий крем финальным шагом всё же нужен каждый день.',
    });
  }

  if (separatedByTime.length) {
    notes.push({
      tone: 'ok',
      text: 'Часть конфликтов решилась сама: эти активы разведены по времени суток, а не по дням.',
    });
  }

  if (rotatedByDay.length) {
    notes.push({
      tone: 'warn',
      text: 'Конфликтующие активы поставлены в разные вечера — не сдвигайте их в один день.',
    });
  }

  const load = items.reduce((sum, a) => sum + a.irritation, 0);
  if (load >= 12) {
    notes.push({
      tone: 'warn',
      text: 'Суммарная нагрузка набора высокая. Вводите новые активы по одному раз в 2–4 недели и следите за реакцией кожи.',
    });
  }

  notes.push({
    tone: 'ok',
    text: 'Расписание — ориентир по совместимости, а не назначение врача. При раздражении или сомнениях обратитесь к дерматологу.',
  });

  return notes;
}
