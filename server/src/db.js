/**
 * SQLite-хранилище каталога косметики.
 *
 * Справочник активов и правил сочетаемости живёт в коде (`public/shared/data.js`) —
 * это редактируемое экспертное знание. В базе лежит только каталог продуктов:
 * он большой, обновляется извне (Open Beauty Facts) и меняется независимо от логики.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const DB_PATH = process.env.SKINLAB_DB || resolve(ROOT, 'data/catalog.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  barcode          TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  brand            TEXT,
  type             TEXT,
  ingredients_text TEXT,
  image_url        TEXT,
  quantity         TEXT,
  categories       TEXT,
  labels           TEXT,
  countries        TEXT,
  source           TEXT NOT NULL,
  search_text      TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand);

CREATE TABLE IF NOT EXISTS product_actives (
  barcode   TEXT NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  active_id TEXT NOT NULL,
  evidence  TEXT,
  PRIMARY KEY (barcode, active_id)
);

CREATE INDEX IF NOT EXISTS product_actives_active_idx ON product_actives(active_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

let db = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}

const norm = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Кладёт продукт в каталог и пересобирает его список активов.
 * `actives` — массив { active_id, evidence } от матчера состава.
 */
export function upsertProduct(product, actives = []) {
  const database = getDb();
  const searchText = norm(
    [product.brand, product.name, product.type, product.categories, product.ingredients_text].filter(Boolean).join(' ')
  );

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO products
           (barcode, name, brand, type, ingredients_text, image_url, quantity, categories, labels, countries, source, search_text, updated_at)
         VALUES
           (@barcode, @name, @brand, @type, @ingredients_text, @image_url, @quantity, @categories, @labels, @countries, @source, @search_text, @updated_at)
         ON CONFLICT(barcode) DO UPDATE SET
           name=excluded.name, brand=excluded.brand, type=excluded.type,
           ingredients_text=excluded.ingredients_text, image_url=excluded.image_url,
           quantity=excluded.quantity, categories=excluded.categories, labels=excluded.labels,
           countries=excluded.countries, source=excluded.source,
           search_text=excluded.search_text, updated_at=excluded.updated_at`
      )
      .run({
        barcode: product.barcode,
        name: product.name || '',
        brand: product.brand || null,
        type: product.type || null,
        ingredients_text: product.ingredients_text || null,
        image_url: product.image_url || null,
        quantity: product.quantity || null,
        categories: product.categories || null,
        labels: product.labels || null,
        countries: product.countries || null,
        source: product.source || 'manual',
        search_text: searchText,
        updated_at: new Date().toISOString(),
      });

    database.prepare('DELETE FROM product_actives WHERE barcode = ?').run(product.barcode);
    const insertActive = database.prepare(
      'INSERT OR IGNORE INTO product_actives (barcode, active_id, evidence) VALUES (?, ?, ?)'
    );
    for (const a of actives) insertActive.run(product.barcode, a.active_id, a.evidence || null);
  });

  tx();
  return getProduct(product.barcode);
}

function rowToProduct(row) {
  if (!row) return null;
  const actives = getDb()
    .prepare('SELECT active_id, evidence FROM product_actives WHERE barcode = ?')
    .all(row.barcode);
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    type: row.type,
    ingredientsText: row.ingredients_text,
    imageUrl: row.image_url,
    quantity: row.quantity,
    categories: row.categories,
    labels: row.labels,
    countries: row.countries,
    source: row.source,
    updatedAt: row.updated_at,
    actives: actives.map((a) => a.active_id),
    activeEvidence: Object.fromEntries(actives.map((a) => [a.active_id, a.evidence])),
  };
}

export function getProduct(barcode) {
  const row = getDb().prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);
  return rowToProduct(row);
}

export function searchProducts(query, { limit = 30, offset = 0 } = {}) {
  const database = getDb();
  const q = norm(query);
  if (!q) {
    const rows = database
      .prepare('SELECT * FROM products ORDER BY updated_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset);
    const total = database.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    return { total, items: rows.map(rowToProduct) };
  }

  const tokens = q.split(' ').filter(Boolean);
  const where = tokens.map(() => 'search_text LIKE ?').join(' AND ');
  const params = tokens.map((t) => `%${t}%`);

  const total = database.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${where}`).get(...params).n;
  const rows = database
    .prepare(`SELECT * FROM products WHERE ${where} ORDER BY LENGTH(search_text) ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { total, items: rows.map(rowToProduct) };
}

/** Продукты, содержащие конкретный актив из справочника. */
export function productsByActive(activeId, { limit = 30, offset = 0 } = {}) {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT p.* FROM products p
       JOIN product_actives pa ON pa.barcode = p.barcode
       WHERE pa.active_id = ?
       ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`
    )
    .all(activeId, limit, offset);
  const total = database
    .prepare('SELECT COUNT(*) AS n FROM product_actives WHERE active_id = ?')
    .get(activeId).n;
  return { total, items: rows.map(rowToProduct) };
}

export function countProducts() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

export function setMeta(key, value) {
  getDb()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

export function getMeta(key) {
  return getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}
