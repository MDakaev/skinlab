/**
 * Smoke-тест API без реального порта (через fastify.inject).
 * Проверяет ключевые эндпоинты и печатает краткий отчёт.
 *
 *   npm run smoke
 */
import { build } from '../src/server.js';
import { countProducts } from '../src/db.js';
import { execFileSync } from 'node:child_process';

if (countProducts() === 0) {
  console.log('Каталог пуст — сначала наполняю демо-данными…');
  execFileSync(process.execPath, ['server/scripts/seed-demo.js'], { stdio: 'inherit' });
}

const app = await build();
let failures = 0;

async function check(name, opts, validate) {
  const res = await app.inject(opts);
  const body = res.json();
  let ok = res.statusCode < 400;
  let detail = '';
  if (ok && validate) {
    try {
      detail = validate(body) || '';
    } catch (err) {
      ok = false;
      detail = err.message;
    }
  }
  console.log(`${ok ? '✓' : '×'} ${name} [${res.statusCode}] ${detail}`);
  if (!ok) failures += 1;
  return body;
}

await check('GET /api/health', { method: 'GET', url: '/api/health' }, (b) => `продуктов: ${b.products}`);

await check('GET /api/actives', { method: 'GET', url: '/api/actives' }, (b) => {
  if (!b.items?.length) throw new Error('пустой список активов');
  return `активов: ${b.items.length}`;
});

await check('GET /api/products?q=retinol', { method: 'GET', url: '/api/products?q=retino' }, (b) => `найдено: ${b.total}`);

await check(
  'POST /api/analyze (actives: retinol+niacinamide)',
  { method: 'POST', url: '/api/analyze', payload: { actives: ['retinol', 'niacinamide'], profile: { skin: 'sensitive', pregnant: true } } },
  (b) => {
    const v = b.analysis?.combo?.verdict?.level;
    const preg = b.analysis?.personalWarnings?.pregnancyBlocked || [];
    if (!v) throw new Error('нет вердикта комбинации');
    return `вердикт: ${v}; беременность блокирует: ${preg.join(', ') || '—'}`;
  }
);

await check(
  'POST /api/analyze (ingredients text)',
  {
    method: 'POST',
    url: '/api/analyze',
    payload: { ingredientsText: 'Aqua, Niacinamide, Salicylic Acid, Zinc PCA, Glycerin', profile: { skin: 'oily' } },
  },
  (b) => {
    const matched = b.ingredients?.matched?.map((m) => m.active_id) || [];
    if (!matched.length) throw new Error('состав не сматчился');
    return `распознаны активы: ${matched.join(', ')}`;
  }
);

await app.close();
console.log(failures ? `\nПровалено проверок: ${failures}` : '\nВсе проверки пройдены.');
process.exit(failures ? 1 : 0);
