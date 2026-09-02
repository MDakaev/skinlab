import './loadEnv.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRoutes } from './routes.js';
import { getDb, countProducts, closeDb } from './db.js';

/** За Nginx держите 127.0.0.1 — порт 8787 не должен быть открыт наружу. */
const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';

export async function build() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    // За Nginx: корректный req.ip из X-Forwarded-For (rate limit).
    trustProxy: true,
  });
  await app.register(cors, { origin: true });
  getDb();

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request failed');
    const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (status >= 500) {
      return reply.code(status).send({ error: 'internal_error' });
    }
    return reply.code(status).send({ error: err.code || err.message || 'request_error' });
  });

  await registerRoutes(app);
  return app;
}

async function main() {
  const app = await build();

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
    } catch (err) {
      app.log.error({ err }, 'error during close');
    }
    try {
      closeDb();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Каталог: ${countProducts()} продуктов. API на http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
