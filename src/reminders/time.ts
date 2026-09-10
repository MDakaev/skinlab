/**
 * Fixed UTC-offset local times → next UTC send timestamp.
 * No IANA/DST: offset is chosen by the user in the bot.
 */

/** Minutes from local midnight (0..1439). */
export function parseHhMm(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatHhMm(minuteOfDay: number): string {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  return min === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(min).padStart(2, '0')}`;
}

/** Supported fixed offsets: UTC−12 … UTC+14 (minutes: 00 / 15 / 30 / 45). */
export const TZ_OFFSET_MIN = -12 * 60;
export const TZ_OFFSET_MAX = 14 * 60;

/**
 * Parse user-entered UTC offset.
 * Accepts: +3, -4, UTC+3, utc-5, +05:30, UTC+5:30, 3, UTC 3
 */
export function parseUtcOffset(text: string): number | null {
  const raw = text
    .trim()
    .replace(/\u2212/g, '-') // Unicode minus
    .replace(/\u2013/g, '-') // en dash
    .replace(/\s+/g, ' ');
  if (!raw) return null;

  const m = raw.match(/^(?:utc)?\s*([+-])?\s*(\d{1,2})(?::(\d{2}))?$/i);
  if (!m) return null;

  const signChar = m[1];
  const hours = Number(m[2]);
  const mins = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isInteger(hours) || !Number.isInteger(mins)) return null;
  if (hours > 14) return null;
  if (mins !== 0 && mins !== 15 && mins !== 30 && mins !== 45) return null;
  // Bare "3" without sign → UTC+3 (common shorthand)
  const sign = signChar === '-' ? -1 : 1;
  const total = sign * (hours * 60 + mins);
  if (total < TZ_OFFSET_MIN || total > TZ_OFFSET_MAX) return null;
  return total;
}

/**
 * Next UTC instant when local wall-clock equals `localMinuteOfDay`
 * under a fixed offset (minutes east of UTC).
 */
export function nextUtcIso(
  localMinuteOfDay: number,
  tzOffsetMinutes: number,
  after: Date = new Date(),
): string {
  const afterMs = after.getTime();
  const localMs = afterMs + tzOffsetMinutes * 60_000;
  const local = new Date(localMs);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  const hour = Math.floor((((localMinuteOfDay % 1440) + 1440) % 1440) / 60);
  const minute = ((localMinuteOfDay % 1440) + 1440) % 1440 % 60;

  let candidate = Date.UTC(y, mo, d, hour, minute, 0, 0) - tzOffsetMinutes * 60_000;
  if (candidate <= afterMs) candidate += 86_400_000;
  return new Date(candidate).toISOString();
}

export function recomputeNextAts(
  morningMinuteLocal: number,
  eveningMinuteLocal: number,
  tzOffsetMinutes: number,
  after: Date = new Date(),
): { nextMorningAt: string; nextEveningAt: string } {
  return {
    nextMorningAt: nextUtcIso(morningMinuteLocal, tzOffsetMinutes, after),
    nextEveningAt: nextUtcIso(eveningMinuteLocal, tzOffsetMinutes, after),
  };
}
