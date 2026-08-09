/**
 * Импорт каталога из Open Beauty Facts.
 *
 * Два режима:
 *   1) По штрихкодам через live API (для точечного добавления):
 *        node server/scripts/import-obf.js 3600551071106 8710447272893
 *   2) Из ночного дампа (для массового наполнения — правильный способ):
 *        node server/scripts/import-obf.js --dump /path/en.openbeautyfacts.org.products.csv.gz --limit 5000
 *
 * Дамп: https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz
 * Дамп tab-разделённый; берём только строки с составом (ingredients_text).
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { fetchProduct } from '../src/obf.js';
import { matchActives } from '../src/inci.js';
import { upsertProduct, countProducts, setMeta } from '../src/db.js';

const args = process.argv.slice(2);

function getFlag(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

async function importByBarcodes(barcodes) {
  let ok = 0;
  for (const code of barcodes) {
    try {
      const p = await fetchProduct(code);
      if (!p) {
        console.warn(`× ${code}: не найден в OBF`);
        continue;
      }
      const actives = matchActives(p.ingredients_text);
      upsertProduct(p, actives);
      ok += 1;
      console.log(`✓ ${code}: ${p.brand || ''} ${p.name} → активы: ${actives.map((a) => a.active_id).join(', ') || '—'}`);
    } catch (err) {
      console.warn(`× ${code}: ${err.message}`);
    }
  }
  return ok;
}

/** Разбор одной CSV-строки OBF (tab-разделённой, без кавычек внутри полей). */
function pick(cols, idx, name) {
  const i = idx[name];
  return i == null ? '' : (cols[i] || '').trim();
}

async function importFromDump(path, limit) {
  const rl = readline.createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let header = null;
  let idx = {};
  let seen = 0;
  let imported = 0;

  for await (const line of rl) {
    if (!header) {
      header = line.split('\t');
      idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
      continue;
    }
    const cols = line.split('\t');
    const code = pick(cols, idx, 'code');
    const name = pick(cols, idx, 'product_name');
    const ingredients = pick(cols, idx, 'ingredients_text');
    if (!code || !name || !ingredients) continue;

    seen += 1;
    const product = {
      barcode: code,
      name,
      brand: pick(cols, idx, 'brands').split(',')[0] || null,
      type: pick(cols, idx, 'product_type') || null,
      ingredients_text: ingredients,
      image_url: pick(cols, idx, 'image_url') || null,
      quantity: pick(cols, idx, 'quantity') || null,
      categories: pick(cols, idx, 'categories') || null,
      labels: pick(cols, idx, 'labels') || null,
      countries: pick(cols, idx, 'countries') || null,
      source: 'openbeautyfacts',
    };
    const actives = matchActives(ingredients);
    upsertProduct(product, actives);
    imported += 1;

    if (imported % 500 === 0) console.log(`… импортировано ${imported}`);
    if (limit && imported >= limit) break;
  }

  console.log(`Просмотрено строк c составом: ${seen}, импортировано: ${imported}`);
  return imported;
}

async function main() {
  const dump = getFlag('--dump');
  const limit = Number.parseInt(getFlag('--limit', '0'), 10) || 0;

  let count;
  if (dump) {
    count = await importFromDump(dump, limit);
  } else {
    const barcodes = args.filter((a) => !a.startsWith('--'));
    if (!barcodes.length) {
      console.error('Укажите штрихкоды или --dump <path.csv.gz>');
      process.exit(1);
    }
    count = await importByBarcodes(barcodes);
  }

  setMeta('last_import', new Date().toISOString());
  console.log(`Готово. Добавлено/обновлено: ${count}. Всего в каталоге: ${countProducts()}.`);
}

main();
