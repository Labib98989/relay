import type { Weekday, OverrideType } from "@/generated/prisma/enums";
import { weekdayFromDate } from "@/lib/week";

// The single source of truth for "what classes happen on date X" — the permanent
// schedule for that weekday with the date's overrides layered on top. Pure and
// data-only so it powers BOTH the dashboard preview and the nightly poster, and
// is trivially unit-testable.

export type ResolvedItem = {
  startTime: string;
  endTime: string;
  name: string;
  color: string;
  room: string | null;
  status: "normal" | "changed" | "extra";
};

export type ResolvedDay = { dayOff: boolean; items: ResolvedItem[] };

type CourseInfo = { name: string; color: string; room: string | null };

export type ResolveSlot = {
  id: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  course: CourseInfo;
};

export type ResolveOverride = {
  type: OverrideType;
  slotId: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  course: CourseInfo | null;
};

export function resolveDay(
  date: Date,
  slots: ResolveSlot[],
  overrides: ResolveOverride[],
): ResolvedDay {
  // A whole-day cancellation wins outright.
  if (overrides.some((o) => o.type === "DAY_OFF")) {
    return { dayOff: true, items: [] };
  }

  const weekday = weekdayFromDate(date);

  // Index slot-targeting overrides for quick lookup.
  const bySlot = new Map<string, ResolveOverride[]>();
  for (const o of overrides) {
    if (o.slotId) {
      const arr = bySlot.get(o.slotId);
      if (arr) arr.push(o);
      else bySlot.set(o.slotId, [o]);
    }
  }

  const items: ResolvedItem[] = [];

  // 1) the permanent schedule for this weekday, with per-slot overrides applied
  for (const s of slots) {
    if (s.weekday !== weekday) continue;
    const ovs = bySlot.get(s.id) ?? [];
    if (ovs.some((o) => o.type === "CANCELLED")) continue; // class is off today
    const changed = ovs.find((o) => o.type === "CHANGED");
    items.push({
      startTime: changed?.startTime ?? s.startTime,
      endTime: changed?.endTime ?? s.endTime,
      name: s.course.name,
      color: s.course.color,
      room: changed?.room ?? s.course.room,
      status: changed ? "changed" : "normal",
    });
  }

  // 2) one-off EXTRA classes added just for this date
  for (const o of overrides) {
    if (o.type !== "EXTRA" || !o.course) continue;
    items.push({
      startTime: o.startTime ?? "",
      endTime: o.endTime ?? "",
      name: o.course.name,
      color: o.course.color,
      room: o.room ?? o.course.room,
      status: "extra",
    });
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { dayOff: false, items };
}
