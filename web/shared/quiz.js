/**
 * Тест типа кожи: короткие вопросы → оценка → один из SKIN_TYPES.
 * Результат сохраняется в профиле через saveProfile({ skin, quizDone: true, ... }).
 */

export const QUIZ_QUESTIONS = [
  {
    id: 'feel',
    title: 'Как кожа ощущается через 1–2 часа после умывания без средств?',
    options: [
      { id: 'tight', label: 'Стянута, хочется крем', scores: { dry: 2, sensitive: 1 } },
      { id: 'fine', label: 'Комфортно, без блеска', scores: { normal: 2 } },
      { id: 'tzone', label: 'Т-зона блестит, щёки в норме', scores: { combo: 2 } },
      { id: 'shine', label: 'Блестит почти всё лицо', scores: { oily: 2 } },
    ],
  },
  {
    id: 'look',
    title: 'Как выглядит кожа к середине дня?',
    options: [
      { id: 'flaky', label: 'Шелушится или выглядит «бумажной»', scores: { dry: 2 } },
      { id: 'even', label: 'Ровная, без сильного блеска', scores: { normal: 2 } },
      { id: 'mixed', label: 'Блеск в центре, суше по краям', scores: { combo: 2 } },
      { id: 'greasy', label: 'Жирный блеск, макияж «плывёт»', scores: { oily: 2 } },
    ],
  },
  {
    id: 'pores',
    title: 'Насколько заметны поры?',
    options: [
      { id: 'tiny', label: 'Почти не видны', scores: { dry: 1, normal: 1 } },
      { id: 'tzonePores', label: 'Крупнее в Т-зоне', scores: { combo: 2, oily: 1 } },
      { id: 'large', label: 'Заметны на большей части лица', scores: { oily: 2 } },
    ],
  },
  {
    id: 'react',
    title: 'Как кожа реагирует на новые средства?',
    options: [
      { id: 'calm', label: 'Обычно спокойно принимает', scores: { normal: 1, oily: 1 } },
      { id: 'sometimes', label: 'Иногда краснеет или щиплет', scores: { combo: 1, sensitive: 1 } },
      { id: 'often', label: 'Часто жжение, краснота, зуд', scores: { sensitive: 3, dry: 1 } },
    ],
  },
  {
    id: 'breakouts',
    title: 'Бывают ли высыпания и чёрные точки?',
    options: [
      { id: 'rare', label: 'Редко или почти никогда', scores: { dry: 1, normal: 1 } },
      { id: 'cycle', label: 'Иногда, чаще в Т-зоне', scores: { combo: 2 } },
      { id: 'oftenAcne', label: 'Часто, комедоны и воспаления', scores: { oily: 2, combo: 1 } },
    ],
  },
  {
    id: 'season',
    title: 'Зимой или на ветру кожа…',
    options: [
      { id: 'crack', label: 'Сильно сушится, может трескаться', scores: { dry: 2, sensitive: 1 } },
      { id: 'okSeason', label: 'Почти не меняется', scores: { normal: 1, oily: 1 } },
      { id: 'mixSeason', label: 'Щёки суше, Т-зона всё ещё жирнится', scores: { combo: 2 } },
      { id: 'red', label: 'Быстро краснеет и реагирует', scores: { sensitive: 2 } },
    ],
  },
];

const SKIN_COPY = {
  dry: {
    title: 'Сухая кожа',
    text: 'Мало собственного кожного сала, часто стянутость и шелушение. Делайте ставку на барьер, увлажнение и мягкое введение активов.',
  },
  oily: {
    title: 'Жирная кожа',
    text: 'Активная выработка себума, заметные поры и склонность к закупоркам. Хорошо переносит кислоты и ретиноиды — но без пересушивания.',
  },
  combo: {
    title: 'Комбинированная кожа',
    text: 'Т-зона жирнее, щёки спокойнее или суше. Активы и увлажнение лучше зонировать: сильнее в центре, мягче по краям.',
  },
  normal: {
    title: 'Нормальная кожа',
    text: 'Баланс без крайностей. Можно пробовать большинство активов, начиная с низкой частоты и наблюдая за реакцией.',
  },
  sensitive: {
    title: 'Чувствительная кожа',
    text: 'Легко краснеет и реагирует на новое. Сначала барьер и увлажнение, активы — по одному и очень постепенно.',
  },
};

/** Подсчёт баллов по ответам { questionId: optionId }. */
export function scoreQuiz(answers) {
  const scores = { dry: 0, oily: 0, combo: 0, normal: 0, sensitive: 0 };

  for (const q of QUIZ_QUESTIONS) {
    const optId = answers[q.id];
    const opt = q.options.find((o) => o.id === optId);
    if (!opt) continue;
    for (const [skin, pts] of Object.entries(opt.scores)) {
      scores[skin] = (scores[skin] || 0) + pts;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [skin, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const confident = top - second >= 2;

  return {
    skin,
    scores,
    confident,
    ...SKIN_COPY[skin],
  };
}

export function quizProgress(answers) {
  const total = QUIZ_QUESTIONS.length;
  const done = QUIZ_QUESTIONS.filter((q) => answers[q.id]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}
