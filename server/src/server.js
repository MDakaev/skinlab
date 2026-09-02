import './loadEnv.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRoutes } from './routes.js';
import { getDb, countProducts } from './db.js';

const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';

export async function build() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
  await app.register(cors, { origin: true });
  getDb();
  await registerRoutes(app);
  return app;
}

async function main() {
  const app = await build();
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
