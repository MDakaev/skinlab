/**
 * Клиент Open Beauty Facts — открытой базы косметики (barcode → продукт + INCI).
 *
 * Правило проекта: live API дёргаем только по реальному скану пользователя
 * (1 запрос = 1 скан). Массовое наполнение каталога — через ночной дамп,
 * а не через этот клиент. См. server/scripts/import-obf.js.
 */
const BASE = process.env.OBF_BASE || 'https://world.openbeautyfacts.org';
const USER_AGENT = process.env.OBF_UA || 'SkinLab/0.1 (cosmetics-consulting)';

const FIELDS = [
  'code',
  'product_name',
  'brands',
  'product_type',
  'categories',
  'ingredients_text',
  'image_url',
  'image_front_url',
  'quantity',
  'labels',
  'countries',
].join(',');

/** Приводит сырой ответ OBF к нашей модели продукта. */
export function normalizeObf(p) {
  if (!p || !p.code) return null;
  const name = (p.product_name || '').trim();
  if (!name) return null;
  return {
    barcode: p.code,
    name,
    brand: (p.brands || '').split(',')[0]?.trim() || null,
    type: p.product_type || null,
    ingredients_text: p.ingredients_text || null,
    image_url: p.image_front_url || p.image_url || null,
    quantity: p.quantity || null,
    categories: p.categories || null,
    labels: p.labels || null,
    countries: p.countries || null,
    source: 'openbeautyfacts',
  };
}

/** Тянет один продукт по штрихкоду. Возвращает null, если не найден. */
export async function fetchProduct(barcode) {
  const url = `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OBF ${res.status} for ${barcode}`);
  const data = await res.json();
  if (data.status !== 1 && !data.product) return null;
  return normalizeObf(data.product);
}
