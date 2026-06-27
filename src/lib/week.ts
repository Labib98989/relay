import { Weekday } from "@/generated/prisma/enums";

// All schedule dates are reasoned about in the CR's local zone (UTC+6), per the
// schema's Override.date / PostLog.forDate comments. These helpers translate
// "this week" into concrete calendar dates the database stores as @db.Date.

const OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6
const ORDER: Weekday[] = [
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
];

// "now", expressed so its UTC fields read as the UTC+6 wall clock.
function nowUTC6(): Date {
  return new Date(Date.now() + OFFSET_MS);
}

// Midnight (UTC) of a date's calendar day — the shape Prisma's @db.Date wants.
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function weekdayIndex(w: Weekday): number {
  return ORDER.indexOf(w);
}

// The weekday a stored @db.Date falls on (dates are UTC-midnight, so UTC day).
export function weekdayFromDate(d: Date): Weekday {
  return ORDER[d.getUTCDay()];
}

export function todayUTC6(): Date {
  return dateOnly(nowUTC6());
}

// The calendar date the nightly digest is about — "tomorrow" in UTC+6.
export function tomorrowUTC6(): Date {
  const t = todayUTC6();
  return new Date(t.getTime() + 24 * 60 * 60 * 1000);
}

// The next calendar date (today included) that falls on the given weekday.
// "Cancel this week" on a Tuesday class targets the upcoming Tuesday.
export function upcomingDateForWeekday(w: Weekday): Date {
  const t = nowUTC6();
  const delta = (weekdayIndex(w) - t.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + delta));
}

// Current wall-clock time of day in UTC+6 as "HH:MM" — compared against a
// space's postTime to decide if its nightly digest is due.
export function currentTimeHMUTC6(): string {
  const t = nowUTC6();
  const h = String(t.getUTCHours()).padStart(2, "0");
  const m = String(t.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// The 7-day window [today, today+6] used to load the active this-week overrides.
export function weekWindowUTC6(): { start: Date; end: Date } {
  const start = todayUTC6();
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start, end };
}
