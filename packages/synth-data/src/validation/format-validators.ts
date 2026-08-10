/**
 * The two "strict formatting" checks requirement 3 names outright — RFC-3339
 * timestamps and UUIDs — kept separate from `brazilian-documents.ts` because
 * these aren't checksums, they're shape-plus-calendar-validity checks: a
 * regex alone accepts `2026-02-30T00:00:00Z`, a date that doesn't exist.
 */

const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isRfc3339Timestamp(value: string): boolean {
  const match = RFC3339_RE.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;

  // Deliberately does NOT round-trip through `new Date(value)` and compare its
  // UTC getters back — that works for a `Z` timestamp, but for an offset
  // timestamp (`-03:00`) the *typed* hour/minute are local to that offset,
  // not UTC, so comparing them against `getUTCHours()` etc. is comparing two
  // different clocks and false-rejects every valid non-Z timestamp. Calendar
  // validity (day exists in that month, hour/minute/second in range) is
  // instead checked directly against the typed components — offset-agnostic.
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second);

  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > daysInMonth(y, mo)) return false;
  if (h > 23 || mi > 59 || s > 60) return false; // :60 tolerated for a leap second
  return true;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RFC 4122 shape (versions 1-5, variant `8|9|a|b`) — not merely "8-4-4-4-12 hex", since a v4-shaped id whose variant nibble is wrong is a giveaway the value was hand-typed, not really a UUID. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
