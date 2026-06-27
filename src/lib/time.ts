// Single source of truth for time DISPLAY.
//
// Times are STORED everywhere as zero-padded "HH:MM" 24h (so string order ==
// chronological order, which is what the schema and the bot's day-sort rely on).
// These helpers only change how a stored value is shown/edited — never what's
// saved. Shared by the editor, the in-app "Tomorrow" preview, and the Discord
// digest so a CR's 12h/24h preference renders identically in all three.

export const pad2 = (n: number) => String(n).padStart(2, "0");

// Parse a stored "HH:MM" into clamped numbers, tolerating junk (→ 00:00).
export function parseHM(v: string): { h: number; m: number } {
  const [hs, ms] = (v ?? "").split(":");
  const h = Number(hs);
  const m = Number(ms);
  return {
    h: Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0,
    m: Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0,
  };
}

export const toHM = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;

// The storage invariant, as a guard: a real zero-padded 24h "HH:MM" with a valid
// hour (00–23) and minute (00–59). Server Actions are reachable by direct POST,
// so every write of a time MUST pass this — the wheel picker can't produce junk,
// but the persistence boundary can't assume the wheel picker was used.
//
// Note we validate FORMAT only, never ordering: start/end are edited (and saved)
// independently, so a row is transiently "reversed" mid-edit (e.g. start bumped
// to 10:00 while end is still 09:30). Rejecting that would fail a perfectly
// normal edit. A reversed range is valid data the CR sees in the preview and
// fixes; only malformed strings are corruption.
export function isHM(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return false;
  const { h, m } = { h: Number(v.slice(0, 2)), m: Number(v.slice(3, 5)) };
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// "08:00" → "8:00 AM" (12h) or "08:00" (24h).
export function formatTime(v: string, hour12: boolean): string {
  const { h, m } = parseHM(v);
  if (!hour12) return toHM(h, m);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ap}`;
}
