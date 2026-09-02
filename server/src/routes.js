/**
 * HTTP-контур API. Отдаёт фронту каталог продуктов и обогащённый анализ:
 * что делает продукт, с чем сочетается, кому и когда подходит, противопоказания.
 */
import {
  allActivesPublic,
  activePublic,
  getActive,
  relationsOf,
  LEVELS,
  SKIN_TYPES,
  CONCERNS,
} from './knowledge.js';
import {
  getProduct,
  searchProducts,
  productsByActive,
  upsertProduct,
  countProducts,
  getMeta,
} from './db.js';
import { matchActives, parseIngredients } from './inci.js';
import { analyzeActives } from './analyze.js';
import { fetchProduct } from './obf.js';
import { MEDICAL_DISCLAIMER } from '../../public/shared/guide.js';
import {
  getOffer,
  checkout as licenseCheckout,
  redeemLicense,
  handleYooWebhook,
  syncPayment,
  issueLicense,
  devLicensesEnabled,
} from './license.js';
import {
  validateInitData,
  telegramConfigured,
  redactInitData,
  webhookSecretHint,
} from './telegram/auth.js';
import { processUpdate, botStatus } from './telegram/bot.js';

const asInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

function readProfile(src = {}) {
  const skin = typeof src.skin === 'string' ? src.skin : null;
  const concerns = Array.isArray(src.concerns)
    ? src.concerns
    : typeof src.concerns === 'string' && src.concerns
      ? src.concerns.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const pregnant = src.pregnant === true || src.pregnant === 'true' || src.pregnant === '1';
  return { skin, concerns, pregnant };
}

/** Продукт из БД → вид для фронта, с раскрытыми активами. */
function decorateProduct(product) {
  if (!product) return null;
  const actives = product.actives.map((id) => activePublic(getActive(id))).filter(Boolean);
  return { ...product, activesResolved: actives };
}

export async function registerRoutes(app) {
  app.get('/api/health', async () => ({
    ok: true,
    products: countProducts(),
    lastImport: getMeta('last_import') || null,
    time: new Date().toISOString(),
  }));

  app.get('/api/meta', async () => ({
    skinTypes: SKIN_TYPES,
    concerns: CONCERNS,
    levels: LEVELS,
    disclaimer: MEDICAL_DISCLAIMER.long,
  }));

  app.get('/api/actives', async () => ({ items: allActivesPublic() }));

  app.get('/api/actives/:id', async (req, reply) => {
    const active = getActive(req.params.id);
    if (!active) return reply.code(404).send({ error: 'active_not_found' });
    const rel = relationsOf(active.id);
    const relations = Object.fromEntries(
      Object.entries(rel).map(([level, items]) => [
        level,
        items.map((r) => ({ id: r.active.id, name: r.active.name, emoji: r.active.emoji, why: r.why })),
      ])
    );
    const products = productsByActive(active.id, { limit: 12 });
    return { active: activePublic(active), relations, products: products.items.map(decorateProduct) };
  });

  app.get('/api/products', async (req) => {
    const { q = '', active, limit, offset } = req.query;
    const opts = { limit: asInt(limit, 30), offset: asInt(offset, 0) };
    const result = active ? productsByActive(active, opts) : searchProducts(q, opts);
    return { total: result.total, items: result.items.map(decorateProduct) };
  });

  app.get('/api/products/:barcode', async (req, reply) => {
    let product = getProduct(req.params.barcode);

    // Кэш-промах = реальный скан пользователя: можно сходить в OBF (1 запрос = 1 скан).
    if (!product && req.query.lookup !== 'false') {
      try {
        const fetched = await fetchProduct(req.params.barcode);
        if (fetched) {
          const actives = matchActives(fetched.ingredients_text);
          product = upsertProduct(fetched, actives);
        }
      } catch (err) {
        req.log.warn({ err: err.message }, 'OBF lookup failed');
      }
    }

    if (!product) return reply.code(404).send({ error: 'product_not_found' });
    return { product: decorateProduct(product) };
  });

  /**
   * Главный эндпоинт. Принимает barcode ИЛИ ingredients ИЛИ actives + профиль кожи,
   * возвращает обогащённый анализ.
   */
  app.post('/api/analyze', async (req, reply) => {
    const body = req.body || {};
    const profile = readProfile(body.profile || body);

    let activeIds = [];
    let product = null;
    let ingredientsMatched = null;

    if (Array.isArray(body.actives) && body.actives.length) {
      activeIds = body.actives;
    } else if (body.ingredients || body.ingredientsText) {
      const text = body.ingredientsText || (Array.isArray(body.ingredients) ? body.ingredients.join(', ') : body.ingredients);
      const matched = matchActives(text);
      ingredientsMatched = { parsed: parseIngredients(text), matched };
      activeIds = matched.map((m) => m.active_id);
    } else if (body.barcode) {
      product = getProduct(body.barcode);
      if (!product && body.lookup !== false) {
        try {
          const fetched = await fetchProduct(body.barcode);
          if (fetched) {
            const actives = matchActives(fetched.ingredients_text);
            product = upsertProduct(fetched, actives);
          }
        } catch (err) {
          req.log.warn({ err: err.message }, 'OBF lookup failed');
        }
      }
      if (!product) return reply.code(404).send({ error: 'product_not_found' });
      activeIds = product.actives;
    } else {
      return reply.code(400).send({ error: 'need_barcode_ingredients_or_actives' });
    }

    const analysis = analyzeActives(activeIds, profile);
    return {
      profile,
      product: decorateProduct(product),
      ingredients: ingredientsMatched,
      analysis,
    };
  });

  /* ---------- Разовая лицензия ---------- */

  app.get('/api/license/offer', async () => getOffer());

  app.post('/api/license/checkout', async (req, reply) => {
    const returnUrl =
      typeof req.body?.returnUrl === 'string' && req.body.returnUrl.startsWith('http')
        ? req.body.returnUrl
        : 'http://127.0.0.1:4173/m1-botanica/?tab=me&license=return';
    const result = await licenseCheckout({ returnUrl });
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.post('/api/license/redeem', async (req, reply) => {
    const code = req.body?.code;
    const result = redeemLicense(code);
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 400;
      return reply.code(status).send(result);
    }
    return result;
  });

  app.get('/api/license/payment/:id', async (req, reply) => {
    const result = await syncPayment(req.params.id);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.post('/api/license/webhook/yookassa', async (req) => {
    // ЮKassa шлёт JSON event; подпись IP можно ужесточить позже.
    return handleYooWebhook(req.body || {});
  });

  /** Только для локальной разработки: выдать код без оплаты. */
  app.post('/api/license/dev-issue', async (req, reply) => {
    if (!devLicensesEnabled()) return reply.code(404).send({ error: 'not_found' });
    const issued = issueLicense({ meta: { via: 'dev-issue' } });
    return { ok: true, code: issued.code };
  });

  /* ---------- Telegram Mini App / bot ---------- */

  app.get('/api/telegram/status', async () => ({
    ok: true,
    ...botStatus(),
  }));

  /**
   * Валидация initData. Клиентский user.id НЕ принимается как доказательство —
   * только подписанная строка initData.
   */
  app.post('/api/telegram/auth', async (req, reply) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    req.log.info({ init: redactInitData(initData) }, 'telegram auth attempt');

    if (!telegramConfigured()) {
      return reply.code(503).send({ ok: false, error: 'telegram_not_configured' });
    }

    const result = validateInitData(initData);
    if (!result.ok) {
      return reply.code(401).send({ ok: false, error: result.error });
    }

    return {
      ok: true,
      user: result.user,
      authDate: result.authDate,
    };
  });

  /**
   * Webhook бота. Опциональный query ?secret=… (см. webhookSecretHint).
   * Без TELEGRAM_BOT_TOKEN отвечает 503.
   */
  app.post('/api/telegram/webhook', async (req, reply) => {
    if (!telegramConfigured()) {
      return reply.code(503).send({ ok: false, error: 'telegram_not_configured' });
    }
    const expected = webhookSecretHint();
    const got = typeof req.query?.secret === 'string' ? req.query.secret : '';
    if (expected && got && got !== expected) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }
    try {
      const result = await processUpdate(req.body || {});
      return result;
    } catch (err) {
      req.log.warn({ err: err.message }, 'telegram webhook failed');
      return reply.code(502).send({ ok: false, error: 'telegram_api_error' });
    }
  });
}
