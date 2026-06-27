import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { OverrideType } from "@/generated/prisma/enums";
import { weekWindowUTC6, weekdayFromDate, tomorrowUTC6 } from "@/lib/week";
import { resolveDay } from "@/lib/resolve";
import { sanitizeLayout } from "@/lib/layout";
import type { EditorData } from "@/components/RoutineEditor";
import SpaceWorkspace from "@/components/SpaceWorkspace";
import {
  addCourse,
  updateCourse,
  deleteCourse,
  placeSlot,
  removeSlot,
  setSlotTimes,
  cancelThisWeek,
  changeRoomThisWeek,
  clearThisWeek,
  addExtraThisWeek,
  clearExtraThisWeek,
  setDayOff,
  clearDayOff,
  updateLayout,
  updateSpaceSettings,
  postTomorrowNow,
} from "./actions";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/");
  }

  // `params` is a Promise in this version of Next.js — it must be awaited.
  const { spaceId } = await params;

  // Ownership is enforced in the query: another CR's space id finds nothing.
  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: session.user.id },
  });
  if (!space) {
    notFound();
  }

  // Load the permanent layer (courses + slots) and the active this-week overrides.
  const { start, end } = weekWindowUTC6();
  const [courses, slots, overrides] = await Promise.all([
    prisma.course.findMany({ where: { spaceId }, orderBy: { name: "asc" } }),
    prisma.routineSlot.findMany({ where: { spaceId } }),
    prisma.override.findMany({
      where: { spaceId, date: { gte: start, lte: end } },
    }),
  ]);

  const data = {
    layout: sanitizeLayout(space.layout),
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      room: c.room ?? "",
      color: c.color,
    })),
    slots: slots.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    overrides: overrides.flatMap((o): EditorData["overrides"] => {
      if (o.type === OverrideType.CANCELLED && o.slotId)
        return [{ kind: "cancel" as const, slotId: o.slotId }];
      if (o.type === OverrideType.CHANGED && o.slotId)
        return [{ kind: "room" as const, slotId: o.slotId, room: o.room ?? undefined }];
      if (o.type === OverrideType.EXTRA && o.courseId && o.startTime && o.endTime)
        return [{
          kind: "extra" as const,
          courseId: o.courseId,
          weekday: weekdayFromDate(o.date),
          startTime: o.startTime,
          endTime: o.endTime,
          room: o.room ?? undefined,
        }];
      if (o.type === OverrideType.DAY_OFF)
        return [{ kind: "dayoff" as const, weekday: weekdayFromDate(o.date) }];
      return [];
    }),
  };

  // Resolve what the bot will post tomorrow (permanent routine + tomorrow's
  // overrides) for the read-only preview.
  const tomorrow = tomorrowUTC6();
  const tomorrowWeekday = weekdayFromDate(tomorrow);
  const [tmrSlots, tmrOverrides] = await Promise.all([
    prisma.routineSlot.findMany({
      where: { spaceId, weekday: tomorrowWeekday },
      include: { course: true },
    }),
    prisma.override.findMany({
      where: { spaceId, date: tomorrow },
      include: { course: true },
    }),
  ]);
  const resolved = resolveDay(tomorrow, tmrSlots, tmrOverrides);
  const dateLabel = tomorrow.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  // Space-scoped Server Actions handed to the (client) editor as props.
  const actions = {
    addCourse: addCourse.bind(null, space.id),
    updateCourse,
    deleteCourse,
    placeSlot: placeSlot.bind(null, space.id),
    removeSlot,
    setSlotTimes,
    cancelThisWeek,
    changeRoomThisWeek,
    clearThisWeek,
    addExtraThisWeek: addExtraThisWeek.bind(null, space.id),
    clearExtraThisWeek: clearExtraThisWeek.bind(null, space.id),
    setDayOff: setDayOff.bind(null, space.id),
    clearDayOff: clearDayOff.bind(null, space.id),
    updateLayout: updateLayout.bind(null, space.id),
  };

  return (
    <SpaceWorkspace
      spaceName={space.name}
      connected={!!space.discordChannelId}
      resolved={resolved}
      dateLabel={dateLabel}
      initial={{
        postTime: space.postTime,
        hour12: space.hour12,
        channelId: space.discordChannelId ?? "",
        notificationsEnabled: space.notificationsEnabled,
      }}
      data={data}
      postingActions={{
        updateSettings: updateSpaceSettings.bind(null, space.id),
        postNow: postTomorrowNow.bind(null, space.id),
      }}
      editorActions={actions}
    />
  );
}
