/**
 * Advent calendar book helpers: year resolution and Europe/Berlin door unlock.
 */

export const ADVENT_DAY_COUNT = 24;

/** Advent season year for a new book (after Dec 24 → next year). */
export function resolveAdventYear(now = new Date()): number {
  const parts = berlinDateParts(now);
  if (parts.month === 12 && parts.day > 24) {
    return parts.year + 1;
  }
  return parts.year;
}

/** True when the calendar door for `day` (1–24) is open in Europe/Berlin. */
export function isAdventDoorOpen(
  day: number,
  year: number,
  now = new Date(),
): boolean {
  if (day < 1 || day > ADVENT_DAY_COUNT) return false;
  const today = berlinDateParts(now);
  const todayKey = today.year * 10_000 + today.month * 100 + today.day;
  const unlockKey = year * 10_000 + 12 * 100 + day;
  return todayKey >= unlockKey;
}

export function adventUnlockDateIso(day: number, year: number): string {
  return `${year}-12-${String(day).padStart(2, "0")}`;
}

function berlinDateParts(now: Date): {
  year: number;
  month: number;
  day: number;
} {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = formatted.split("-").map(Number);
  return { year, month, day };
}
