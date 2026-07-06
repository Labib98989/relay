import { prisma } from "@/lib/prisma";
import { OverrideType } from "@/generated/prisma/enums";
import { weekWindowUTC6, weekdayFromDate } from "@/lib/week";
import { sanitizeLayout } from "@/lib/layout";
import type { EditorData, EditorActions } from "@/components/ScheduleEditor";
import {
  addCourse,
  updateCourse,
  deleteCourse,
  placeSlot,
  removeSlot,
  setSlotTimes,
  cancelThisWeek,
  changeRoomThisWeek,
  changeTimeThisWeek,
  clearThisWeek,
  addExtraThisWeek,
  clearExtraThisWeek,
  setDayOff,
  clearDayOff,
  updateLayout,
} from "./actions";

// Shared by the Dashboard ("This week") and Weekly-routine ("permanent") sections
// — both render the same editor over the same data, just pinned to one layer. The
// override→editor mapping mirrors the resolver's contract (see src/lib/resolve.ts).
export async function loadEditorData(spaceId: string, spaceLayout: unknown): Promise<EditorData> {
  const { start, end } = weekWindowUTC6();
  const [courses, slots, overrides] = await Promise.all([
    prisma.course.findMany({ where: { spaceId }, orderBy: { name: "asc" } }),
    prisma.scheduleSlot.findMany({ where: { spaceId } }),
    prisma.override.findMany({ where: { spaceId, date: { gte: start, lte: end } } }),
  ]);

  return {
    layout: sanitizeLayout(spaceLayout),
    courses: courses.map((c) => ({ id: c.id, name: c.name, room: c.room ?? "", color: c.color })),
    slots: slots.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    overrides: overrides.flatMap((o): EditorData["overrides"] => {
      if (o.type === OverrideType.CANCELLED && o.slotId) return [{ kind: "cancel" as const, slotId: o.slotId }];
      if (o.type === OverrideType.CHANGED && o.slotId)
        return [{
          kind: "room" as const,
          slotId: o.slotId,
          room: o.room ?? undefined,
          // A CHANGED override may also move the occurrence to a new time band
          // (e.g. via the AI's reschedule_class_once) — carry it for the badge.
          startTime: o.startTime ?? undefined,
          endTime: o.endTime ?? undefined,
        }];
      if (o.type === OverrideType.EXTRA && o.courseId && o.startTime && o.endTime)
        return [{
          kind: "extra" as const,
          courseId: o.courseId,
          weekday: weekdayFromDate(o.date),
          startTime: o.startTime,
          endTime: o.endTime,
          room: o.room ?? undefined,
        }];
      if (o.type === OverrideType.DAY_OFF) return [{ kind: "dayoff" as const, weekday: weekdayFromDate(o.date) }];
      return [];
    }),
  };
}

// The space-scoped Server Actions the (client) editor calls. Binding spaceId here
// keeps the two section pages tiny.
export function editorActions(spaceId: string): EditorActions {
  return {
    addCourse: addCourse.bind(null, spaceId),
    updateCourse,
    deleteCourse,
    placeSlot: placeSlot.bind(null, spaceId),
    removeSlot,
    setSlotTimes,
    cancelThisWeek,
    changeRoomThisWeek,
    // @relay-test-button — only the editor's test menu item calls this today;
    // the real consumers are the AI tools. Grep tag to remove the test wiring.
    changeTimeThisWeek,
    clearThisWeek,
    addExtraThisWeek: addExtraThisWeek.bind(null, spaceId),
    clearExtraThisWeek: clearExtraThisWeek.bind(null, spaceId),
    setDayOff: setDayOff.bind(null, spaceId),
    clearDayOff: clearDayOff.bind(null, spaceId),
    updateLayout: updateLayout.bind(null, spaceId),
  };
}
