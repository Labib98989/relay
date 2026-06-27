// The editor "scaffold" that the schema's slots/overrides DON'T capture: the
// time rows (including breaks and still-empty periods) and which days are
// weekends. Persisted as one JSON blob on ScheduleSpace.layout so a CR builds
// their day's shape once and it survives every reload — instead of being
// re-derived from defaults each session.
//
// Slots/overrides remain the source of truth for what's PLACED; this only
// remembers the grid those placements live on.

import { Weekday } from "@/generated/prisma/enums";
import { isHM } from "@/lib/time";

export type LayoutRow = {
  id: string;
  kind: "class" | "break";
  start: string;
  end: string;
  label?: string;
};

export type Layout = {
  rows: LayoutRow[];
  weekend: Weekday[];
};

// Bangladesh week: Friday + Saturday are the default weekend. Three 90-minute
// periods is a sane starting grid; the CR reshapes it from there.
export const DEFAULT_LAYOUT: Layout = {
  rows: [
    { id: "r0", kind: "class", start: "08:00", end: "09:30" },
    { id: "r1", kind: "class", start: "09:40", end: "11:10" },
    { id: "r2", kind: "class", start: "11:40", end: "13:10" },
  ],
  weekend: [Weekday.SATURDAY, Weekday.FRIDAY],
};

const WEEKDAYS = new Set<string>(Object.values(Weekday));

// Coerce whatever came over the wire (a Server Action arg, or a legacy JSON
// blob) into a trustworthy Layout. Drops malformed rows rather than throwing,
// so one bad row can never wedge the whole editor. Returns null if there's
// nothing usable, letting callers fall back to deriving from slots.
export function sanitizeLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { rows?: unknown; weekend?: unknown };

  const rows: LayoutRow[] = Array.isArray(obj.rows)
    ? obj.rows.flatMap((r): LayoutRow[] => {
        if (!r || typeof r !== "object") return [];
        const { id, kind, start, end, label } = r as Record<string, unknown>;
        if (typeof id !== "string") return [];
        if (kind !== "class" && kind !== "break") return [];
        // Format only — a transiently reversed range (start >= end) is valid
        // mid-edit data; dropping the row here would silently lose it. See isHM.
        if (!isHM(start) || !isHM(end)) return [];
        return [{ id, kind, start, end, ...(typeof label === "string" ? { label } : {}) }];
      })
    : [];

  const weekend: Weekday[] = Array.isArray(obj.weekend)
    ? [...new Set(obj.weekend.filter((d): d is Weekday => typeof d === "string" && WEEKDAYS.has(d)))]
    : [];

  if (rows.length === 0 && weekend.length === 0) return null;
  return { rows, weekend };
}
