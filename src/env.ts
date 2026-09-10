/**
 * Cloudflare Worker bindings and secrets.
 * Secrets are never logged; missing ones fail closed at the route boundary.
 */

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;

  /** Display name in bot / Mini App. */
  PUBLIC_APP_NAME: string;
  /** Optional public origin, e.g. https://skinlab.xxx.workers.dev */
  PUBLIC_BASE_URL?: string;
  /** Telegram @username for support (without @). */
  SUPPORT_USERNAME?: string;
  /** Support email shown in bot / legal. */
  SUPPORT_EMAIL?: string;

  TELEGRAM_BOT_TOKEN: string;
  /** Telegram webhook secret_token (header) and/or legacy ?secret= */
  TELEGRAM_WEBHOOK_SECRET: string;
  PLATEGA_MERCHANT_ID: string;
  PLATEGA_SECRET: string;
  /** Protects /admin and /api/admin/* */
  ADMIN_SECRET: string;
  /**
   * Comma-separated Telegram user ids with free forever access (owner).
   * Example: "123456789,987654321"
   */
  OWNER_TELEGRAM_IDS?: string;
};
