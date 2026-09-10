/**
 * Admin API auth — X-Admin-Secret header only (never ?secret= — leaks via logs/Referer).
 */

import type { Context } from 'hono';
import type { Env } from '../env';

const WEAK_ADMIN_SECRETS = new Set([
  'change-me-admin-random',
  'change-me',
  'admin',
  'secret',
  'password',
]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function adminAuthorized(c: Context<{ Bindings: Env }>): boolean {
  const expected = c.env.ADMIN_SECRET;
  if (!expected || expected.length < 16 || WEAK_ADMIN_SECRETS.has(expected)) return false;
  const header = c.req.header('X-Admin-Secret') || '';
  if (!header) return false;
  return timingSafeEqual(header, expected);
}
