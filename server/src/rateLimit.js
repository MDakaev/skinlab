/**
 * Простой in-memory rate limit (один процесс Node).
 * Достаточно для MVP на одном VDS; не шарится между инстансами.
 */

const buckets = new Map();

/**
 * @param {string} key
 * @param {number} limit
 * @param {number} windowMs
 * @returns {boolean} true если запрос разрешён
 */
export function allowRequest(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientKey(req, prefix) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const first = String(ip).split(',')[0].trim();
  return `${prefix}:${first}`;
}
