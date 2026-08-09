/**
 * Наполняет каталог демонстрационными продуктами из общего справочника
 * (`public/shared/data.js`). Полезно, чтобы поднять API без импорта дампа OBF.
 *
 *   npm run seed
 */
import { PRODUCTS, getActive } from '../src/knowledge.js';
import { upsertProduct, countProducts, setMeta } from '../src/db.js';

function ingredientsTextFor(actives) {
  return actives
    .map((id) => getActive(id)?.inci)
    .filter(Boolean)
    .join(', ');
}

let n = 0;
for (const p of PRODUCTS) {
  const product = {
    barcode: `demo-${p.id}`,
    name: p.name,
    brand: p.brand,
    type: p.type,
    ingredients_text: ingredientsTextFor(p.actives),
    source: 'demo',
  };
  const actives = p.actives.filter((id) => getActive(id)).map((id) => ({ active_id: id, evidence: 'demo-seed' }));
  upsertProduct(product, actives);
  n += 1;
}

setMeta('last_seed', new Date().toISOString());
console.log(`Загружено демо-продуктов: ${n}. Всего в каталоге: ${countProducts()}.`);
