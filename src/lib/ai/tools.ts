import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { todayUTC6, weekdayFromDate, upcomingDateForWeekday, weekWindowUTC6 } from "@/lib/week";
import { createSpaceForUser } from "@/lib/spaces";
import type { RouteKey } from "@/lib/categories";
import type { EventCategory, Weekday } from "@/generated/prisma/enums";
import {
  addCourse, updateCourse, deleteCourse,
  placeSlot, removeSlot, setSlotTimes,
  cancelThisWeek, changeRoomThisWeek, changeTimeThisWeek, clearThisWeek,
  addExtraThisWeek, clearExtraThisWeek, setDayOff, clearDayOff,
  updateSpaceSettings, postTomorrowNow, renameSpace,
  addEvent, updateEvent, deleteEvent, setChannelRoute,
  type EventInput,
} from "@/app/dashboard/[spaceId]/actions";
import { type AiActionContext, AiToolError, assertOwnedSpaceFor } from "./context";
import { weekday, hhmm, ymd, eventCategory, routeKey, spaceId, hexColor, permanenceGate } from "./schemas";

// ---------------------------------------------------------------------------
// The canonical AI tool catalog — defined ONCE, consumed by every transport:
// the Claude MCP connector, the ChatGPT Actions dispatcher, and the in-app
// chat loop (see registry.ts). Handlers are thin wrappers over the existing
// Server Actions; they add nothing but input validation, an ownership check,
// and a model-readable result.
//
// Steering lives HERE, in tool identity, because stages 1–2 don't control the
// client's system prompt: ambiguous "move/cancel/change my class" requests
// must default to the temporary *_once tools (an Override for the upcoming
// occurrence); the permanent tools carry heavier names, warning descriptions,
// and a schema-level permanence gate the model must explicitly satisfy.
// ---------------------------------------------------------------------------

export type AiToolResult = { summary: string; data?: unknown };

export type AiTool = {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  readOnly?: boolean;
  handler: (input: any, ctx: AiActionContext) => Promise<AiToolResult>;
};

// Keeps each tool's handler typed against its own shape without every caller
// needing the generics.
function tool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  shape: S;
  readOnly?: boolean;
  handler: (input: z.infer<z.ZodObject<S>>, ctx: AiActionContext) => Promise<AiToolResult>;
}): AiTool {
  return def as unknown as AiTool;
}

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

// The next 7 calendar days (today first) — grounding for "tomorrow"/"Thursday"
// so external models don't have to guess what today is in the CR's timezone.
function upcomingDates() {
  const start = todayUTC6();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    return { date: ymdOf(d), weekday: weekdayFromDate(d) };
  });
}

// A slot the caller owns, with enough context for a human-readable summary.
async function ownedSlotInfo(ctx: AiActionContext, slotId: string) {
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, space: { ownerId: ctx.userId } },
    select: {
      id: true, weekday: true, startTime: true, endTime: true, spaceId: true,
      course: { select: { name: true } },
    },
  });
  if (!slot) throw new AiToolError("Class slot not found — call get_schedule to see valid slotIds.");
  return slot;
}

// Default palette for AI-created courses (mirrors the editor's tile colors).
const COURSE_COLORS = ["#f4632e", "#2f93e6", "#15b886", "#e8467c", "#f3b324", "#8b5cf6", "#ef4444", "#18b6c9"];

/* --------------------------------- reads ---------------------------------- */

const listSpaces = tool({
  name: "list_spaces",
  description:
    "List the user's schedule spaces (one per class section) with their ids. " +
    "Call this first when you don't know which space to act on. " +
    "Also returns today's date in the schedule's timezone (UTC+6).",
  shape: {},
  readOnly: true,
  handler: async (_input, ctx) => {
    const spaces = await prisma.scheduleSpace.findMany({
      where: { ownerId: ctx.userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, postTime: true, hour12: true, notificationsEnabled: true, discordChannelId: true },
    });
    const today = todayUTC6();
    return {
      summary: `You have ${spaces.length} space(s).`,
      data: {
        today: { date: ymdOf(today), weekday: weekdayFromDate(today) },
        spaces: spaces.map((s) => ({
          id: s.id, name: s.name, postTime: s.postTime, hour12: s.hour12,
          notificationsEnabled: s.notificationsEnabled,
          mainChannelConnected: !!s.discordChannelId,
        })),
      },
    };
  },
});

const getSchedule = tool({
  name: "get_schedule",
  description:
    "Get a space's full schedule: the courses (with courseIds), the permanent weekly " +
    "grid (with slotIds), and this week's temporary changes. ALWAYS call this before " +
    "any schedule mutation — the slotId/courseId every other tool needs comes from here. " +
    "Also returns the next 7 calendar dates so you can resolve 'tomorrow' or 'Thursday'.",
  shape: { spaceId },
  readOnly: true,
  handler: async (input, ctx) => {
    const space = await assertOwnedSpaceFor(ctx, input.spaceId);
    const { start, end } = weekWindowUTC6();
    const [courses, slots, overrides] = await Promise.all([
      prisma.course.findMany({
        where: { spaceId: input.spaceId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, room: true, color: true },
      }),
      prisma.scheduleSlot.findMany({
        where: { spaceId: input.spaceId },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
        select: { id: true, weekday: true, startTime: true, endTime: true, course: { select: { id: true, name: true, room: true } } },
      }),
      prisma.override.findMany({
        where: { spaceId: input.spaceId, date: { gte: start, lte: end } },
        select: {
          type: true, date: true, startTime: true, endTime: true, room: true, note: true,
          course: { select: { name: true } },
          slot: { select: { id: true, startTime: true, endTime: true, course: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      summary: `Schedule for "${space.name}": ${courses.length} course(s), ${slots.length} weekly class slot(s), ${overrides.length} change(s) this week.`,
      data: {
        space: { id: space.id, name: space.name, hour12: space.hour12 },
        upcomingDates: upcomingDates(),
        courses,
        weeklySchedule: slots.map((s) => ({
          slotId: s.id, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime,
          courseId: s.course.id, course: s.course.name, room: s.course.room,
        })),
        thisWeekChanges: overrides.map((o) => ({
          date: ymdOf(o.date), weekday: weekdayFromDate(o.date), type: o.type,
          course: o.slot?.course.name ?? o.course?.name ?? null,
          slotId: o.slot?.id ?? null,
          originalTime: o.slot ? `${o.slot.startTime}-${o.slot.endTime}` : null,
          newStartTime: o.startTime, newEndTime: o.endTime, newRoom: o.room, note: o.note,
        })),
      },
    };
  },
});

const listUpcomingEvents = tool({
  name: "list_upcoming_events",
  description:
    "List a space's upcoming calendar events (exams, quizzes, assignments, notices…) " +
    "within the next N days (default 30), with their eventIds.",
  shape: {
    spaceId,
    days: z.number().int().min(1).max(90).optional()
      .describe("How many days ahead to look (default 30)"),
  },
  readOnly: true,
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const start = todayUTC6();
    const end = new Date(start.getTime() + (input.days ?? 30) * 24 * 60 * 60 * 1000);
    const events = await prisma.event.findMany({
      where: { spaceId: input.spaceId, date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true, title: true, date: true, category: true, startTime: true, endTime: true, note: true,
        course: { select: { name: true } },
      },
    });
    return {
      summary: `${events.length} upcoming event(s) in the next ${input.days ?? 30} days.`,
      data: events.map((e) => ({
        eventId: e.id, title: e.title, date: ymdOf(e.date), weekday: weekdayFromDate(e.date),
        category: e.category, startTime: e.startTime, endTime: e.endTime,
        course: e.course?.name ?? null, note: e.note,
      })),
    };
  },
});

/* ---------------- temporary changes (the DEFAULT for edits) ---------------- */

const rescheduleClassOnce = tool({
  name: "reschedule_class_once",
  description:
    "Move ONE occurrence of a recurring class to a new time (and optionally room) — " +
    "applies only to the next upcoming occurrence of that class, then everything " +
    "returns to normal. This is the DEFAULT choice whenever the user asks to move, " +
    "shift or reschedule a class without explicitly saying the change is permanent. " +
    "Does NOT modify the permanent weekly schedule. For a permanent change the user " +
    "explicitly asked for, use edit_permanent_schedule instead. " +
    "Cannot target dates beyond the upcoming occurrence.",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot to move (from get_schedule)"),
    newStartTime: hhmm,
    newEndTime: hhmm,
    newRoom: z.string().max(60).optional().describe("Optionally also change the room for this occurrence"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await changeTimeThisWeek(input.slotId, input.newStartTime, input.newEndTime, input.newRoom);
    const date = ymdOf(upcomingDateForWeekday(slot.weekday));
    return {
      summary:
        `Moved ${slot.course.name} on ${slot.weekday} ${date} to ${input.newStartTime}–${input.newEndTime}` +
        `${input.newRoom ? ` (room ${input.newRoom})` : ""}. One-time change — the permanent weekly schedule is unchanged.`,
    };
  },
});

const cancelClassOnce = tool({
  name: "cancel_class_once",
  description:
    "Cancel ONE occurrence of a class — only the next upcoming occurrence; it resumes " +
    "automatically the following week. This is the DEFAULT for 'cancel/skip the class' " +
    "requests. Does NOT remove the class from the permanent weekly schedule (that would " +
    "be remove_class_permanently, only for explicit permanent requests).",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot to cancel (from get_schedule)"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await cancelThisWeek(input.slotId);
    const date = ymdOf(upcomingDateForWeekday(slot.weekday));
    return {
      summary: `Cancelled ${slot.course.name} on ${slot.weekday} ${date}. One-time — it's back next week as usual.`,
    };
  },
});

const changeRoomOnce = tool({
  name: "change_room_once",
  description:
    "Change the room of ONE occurrence of a class (the next upcoming one) without " +
    "touching the permanent schedule. DEFAULT for room-change requests unless the user " +
    "explicitly says the room change is permanent (then use update_course to change the " +
    "course's room, or edit_permanent_schedule).",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot (from get_schedule)"),
    room: z.string().min(1).max(60).describe("The room for this one occurrence"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await changeRoomThisWeek(input.slotId, input.room);
    const date = ymdOf(upcomingDateForWeekday(slot.weekday));
    return {
      summary: `Room for ${slot.course.name} on ${slot.weekday} ${date} set to ${input.room} for this occurrence only.`,
    };
  },
});

const clearOverrideOnce = tool({
  name: "clear_class_change_once",
  description:
    "Undo a temporary change (cancellation, room change or time move) on a class's " +
    "upcoming occurrence, restoring it to its normal permanent-schedule state.",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot whose temporary change to clear"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await clearThisWeek(input.slotId);
    return { summary: `Cleared this week's change on ${slot.course.name} (${slot.weekday}) — back to the normal schedule.` };
  },
});

const addExtraClassOnce = tool({
  name: "add_extra_class_once",
  description:
    "Add a ONE-TIME extra class session (e.g. a makeup class) on the upcoming occurrence " +
    "of the given weekday. It is not part of the permanent schedule and disappears after " +
    "that date. To add a class every week, use place_class_permanently (explicit " +
    "permanent requests only).",
  shape: {
    spaceId,
    courseId: z.string().min(1).describe("Which course the extra session is for (from get_schedule)"),
    weekday,
    startTime: hhmm,
    endTime: hhmm,
    room: z.string().max(60).optional(),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await addExtraThisWeek(input.spaceId, input.courseId, input.weekday as Weekday, input.startTime, input.endTime, input.room ?? "");
    const date = ymdOf(upcomingDateForWeekday(input.weekday as Weekday));
    return { summary: `Added a one-off class on ${input.weekday} ${date}, ${input.startTime}–${input.endTime}. Not part of the weekly schedule.` };
  },
});

const clearExtraClassOnce = tool({
  name: "clear_extra_class_once",
  description: "Remove a previously added one-time extra class from the upcoming occurrence of a weekday.",
  shape: {
    spaceId,
    weekday,
    startTime: hhmm.describe("The start time the extra class was added with"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await clearExtraThisWeek(input.spaceId, input.weekday as Weekday, input.startTime);
    return { summary: `Removed the one-off class on ${input.weekday} at ${input.startTime}.` };
  },
});

const setDayOffOnce = tool({
  name: "set_day_off_once",
  description:
    "Mark an ENTIRE day off (all classes cancelled) for the upcoming occurrence of that " +
    "weekday only — e.g. 'no classes this Thursday'. The following week is unaffected. " +
    "DEFAULT for day-off requests; there is no permanent day-off concept (permanently " +
    "free days are just days with no classes placed).",
  shape: { spaceId, weekday },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await setDayOff(input.spaceId, input.weekday as Weekday);
    const date = ymdOf(upcomingDateForWeekday(input.weekday as Weekday));
    return { summary: `Marked ${input.weekday} ${date} as a day off. One-time — next week runs normally.` };
  },
});

const clearDayOffOnce = tool({
  name: "clear_day_off_once",
  description: "Undo a day-off mark on the upcoming occurrence of a weekday, restoring its classes.",
  shape: { spaceId, weekday },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await clearDayOff(input.spaceId, input.weekday as Weekday);
    return { summary: `${input.weekday} is no longer marked off — classes are back on.` };
  },
});

/* --------------- permanent schedule (explicit requests ONLY) --------------- */

const editPermanentSchedule = tool({
  name: "edit_permanent_schedule",
  description:
    "PERMANENTLY retime a recurring class in the weekly timetable — affects every future " +
    "week. Only use when the user EXPLICITLY said the change is permanent ('permanently', " +
    "'every week', 'from now on', 'change the actual timetable'). If the user just said " +
    "'move Thursday's class to 3pm' with no permanence language, that is a one-time change: " +
    "use reschedule_class_once instead — that is the correct default.",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot to permanently retime (from get_schedule)"),
    newStartTime: hhmm,
    newEndTime: hhmm,
    ...permanenceGate,
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await setSlotTimes([input.slotId], input.newStartTime, input.newEndTime);
    return {
      summary:
        `PERMANENTLY moved ${slot.course.name} (${slot.weekday}) from ${slot.startTime}–${slot.endTime} ` +
        `to ${input.newStartTime}–${input.newEndTime}, every week from now on.`,
    };
  },
});

const placeClassPermanently = tool({
  name: "place_class_permanently",
  description:
    "PERMANENTLY add a recurring class to the weekly timetable (every week going forward). " +
    "Only for explicit permanent requests — a one-time extra session is add_extra_class_once " +
    "(the default for 'add a class on <day>' without permanence language). NOTE: this " +
    "replaces whatever class currently occupies the same day+start-time cell.",
  shape: {
    spaceId,
    courseId: z.string().min(1).describe("The course to place (from get_schedule)"),
    weekday,
    startTime: hhmm,
    endTime: hhmm,
    ...permanenceGate,
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await placeSlot(input.spaceId, input.courseId, input.weekday as Weekday, input.startTime, input.endTime);
    return { summary: `PERMANENTLY placed the class on ${input.weekday} ${input.startTime}–${input.endTime}, every week.` };
  },
});

const removeClassPermanently = tool({
  name: "remove_class_permanently",
  description:
    "PERMANENTLY remove a recurring class from the weekly timetable — it stops happening " +
    "every week. Only for explicit permanent requests; 'cancel the class' without permanence " +
    "language means cancel_class_once (the default).",
  shape: {
    spaceId,
    slotId: z.string().min(1).describe("The class slot to remove permanently (from get_schedule)"),
    ...permanenceGate,
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const slot = await ownedSlotInfo(ctx, input.slotId);
    await removeSlot(input.slotId);
    return { summary: `PERMANENTLY removed ${slot.course.name} from ${slot.weekday} ${slot.startTime}–${slot.endTime}.` };
  },
});

/* --------------------------------- courses --------------------------------- */

const addCourseTool = tool({
  name: "add_course",
  description:
    "Create a course (a reusable class chip: name, default room, color) in a space. " +
    "Creating a course does NOT schedule it — place it with place_class_permanently or " +
    "add_extra_class_once afterwards.",
  shape: {
    spaceId,
    name: z.string().min(1).max(80).describe("Course name, e.g. \"CSE 2101\""),
    room: z.string().max(60).optional().describe("Default room"),
    color: hexColor.optional().describe("Tile color; omit to auto-pick"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const count = await prisma.course.count({ where: { spaceId: input.spaceId } });
    const color = input.color ?? COURSE_COLORS[count % COURSE_COLORS.length];
    const { id } = await addCourse(input.spaceId, input.name, color, input.room ?? "");
    return { summary: `Created course "${input.name}" (courseId: ${id}). It isn't scheduled yet.`, data: { courseId: id } };
  },
});

const updateCourseTool = tool({
  name: "update_course",
  description: "Update a course's name, default room, or color (affects everywhere the course appears).",
  shape: {
    spaceId,
    courseId: z.string().min(1),
    name: z.string().min(1).max(80).optional(),
    room: z.string().max(60).optional(),
    color: hexColor.optional(),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await updateCourse(input.courseId, { name: input.name, room: input.room, color: input.color });
    return { summary: "Course updated." };
  },
});

const deleteCourseTool = tool({
  name: "delete_course",
  description:
    "DELETE a course and, with it, every weekly slot and temporary change that references " +
    "it. Destructive and not undoable — confirm with the user before calling.",
  shape: {
    spaceId,
    courseId: z.string().min(1),
    confirmDelete: z.literal(true).describe("Must be true — set only after the user confirmed the deletion."),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await deleteCourse(input.courseId);
    return { summary: "Course deleted, along with its scheduled slots." };
  },
});

/* ------------------------------ calendar events ----------------------------- */

const addEventTool = tool({
  name: "add_event",
  description:
    "Add a calendar event (exam, class test, quiz, assignment, notice, meetup…) on a " +
    "specific date. If notifications are configured, this immediately announces the event " +
    "to the class's Discord. Omit startTime/endTime for an all-day event.",
  shape: {
    spaceId,
    title: z.string().min(1).max(120),
    date: ymd,
    category: eventCategory,
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    courseId: z.string().optional().describe("Optionally link a course (from get_schedule)"),
    note: z.string().max(500).optional(),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const { id, posted } = await addEvent(input.spaceId, {
      title: input.title, date: input.date, category: input.category as EventCategory,
      startTime: input.startTime ?? null, endTime: input.endTime ?? null,
      courseId: input.courseId ?? null, note: input.note ?? null,
    });
    return {
      summary:
        `Added ${input.category} "${input.title}" on ${input.date} (eventId: ${id}). ` +
        `Discord announcement: ${posted.status === "sent" ? "posted" : `not posted (${posted.reason ?? posted.status})`}.`,
      data: { eventId: id },
    };
  },
});

const updateEventTool = tool({
  name: "update_event",
  description:
    "Update an existing calendar event. Provide only the fields to change; omitted fields " +
    "keep their current values (pass null for startTime/endTime to make it all-day). " +
    "Announces the update to Discord if configured.",
  shape: {
    spaceId,
    eventId: z.string().min(1).describe("From list_upcoming_events"),
    title: z.string().min(1).max(120).optional(),
    date: ymd.optional(),
    category: eventCategory.optional(),
    startTime: hhmm.nullable().optional(),
    endTime: hhmm.nullable().optional(),
    courseId: z.string().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const existing = await prisma.event.findFirst({
      where: { id: input.eventId, space: { ownerId: ctx.userId } },
    });
    if (!existing) throw new AiToolError("Event not found — call list_upcoming_events to see valid eventIds.");
    const merged: EventInput = {
      title: input.title ?? existing.title,
      date: input.date ?? ymdOf(existing.date),
      category: (input.category ?? existing.category) as EventCategory,
      startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
      endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
      courseId: input.courseId !== undefined ? input.courseId : existing.courseId,
      note: input.note !== undefined ? input.note : existing.note,
    };
    const { posted } = await updateEvent(input.eventId, merged);
    return {
      summary: `Event updated. Discord announcement: ${posted.status === "sent" ? "posted" : `not posted (${posted.reason ?? posted.status})`}.`,
    };
  },
});

const deleteEventTool = tool({
  name: "delete_event",
  description: "Delete a calendar event (announces the cancellation to Discord first, if configured).",
  shape: {
    spaceId,
    eventId: z.string().min(1).describe("From list_upcoming_events"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const existing = await prisma.event.findFirst({
      where: { id: input.eventId, space: { ownerId: ctx.userId } },
      select: { id: true },
    });
    if (!existing) throw new AiToolError("Event not found — call list_upcoming_events to see valid eventIds.");
    await deleteEvent(input.eventId);
    return { summary: "Event deleted (cancellation announced to Discord if configured)." };
  },
});

/* ------------------------------ space & settings ---------------------------- */

const updateSpaceSettingsTool = tool({
  name: "update_space_settings",
  description:
    "Update a space's posting settings: main Discord channel id, nightly digest post time " +
    "(24h HH:MM, UTC+6), whether notifications are enabled, and 12h/24h display.",
  shape: {
    spaceId,
    discordChannelId: z.string().optional().describe("Discord channel id (digits); empty string disconnects"),
    postTime: hhmm.optional(),
    notificationsEnabled: z.boolean().optional(),
    hour12: z.boolean().optional(),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await updateSpaceSettings(input.spaceId, {
      discordChannelId: input.discordChannelId,
      postTime: input.postTime,
      notificationsEnabled: input.notificationsEnabled,
      hour12: input.hour12,
    });
    return { summary: "Space settings updated." };
  },
});

const setChannelRouteTool = tool({
  name: "set_channel_route",
  description:
    'Route a post target ("DIGEST" for the nightly schedule, or an event category like ' +
    '"EXAM") to a specific Discord channel. An empty channelId clears the route so that ' +
    "target falls back to the space's main channel.",
  shape: {
    spaceId,
    target: routeKey,
    channelId: z.string().describe("Discord channel id (digits), or empty string to clear the route"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await setChannelRoute(input.spaceId, input.target as RouteKey, input.channelId || null);
    return { summary: input.channelId ? `Routed ${input.target} to channel ${input.channelId}.` : `Cleared the ${input.target} route (falls back to the main channel).` };
  },
});

const postTomorrowNowTool = tool({
  name: "post_tomorrow_digest_now",
  description:
    "Immediately post tomorrow's schedule digest to the space's Discord channel (bypasses " +
    "the scheduled post time — useful for testing the channel wiring).",
  shape: { spaceId },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    const result = await postTomorrowNow(input.spaceId);
    return {
      summary: result.status === "sent"
        ? "Tomorrow's digest was posted to Discord."
        : `Digest not posted: ${result.reason ?? result.status}.`,
    };
  },
});

const renameSpaceTool = tool({
  name: "rename_space",
  description: "Rename a schedule space.",
  shape: {
    spaceId,
    name: z.string().min(1).max(60).describe("The new space name"),
  },
  handler: async (input, ctx) => {
    await assertOwnedSpaceFor(ctx, input.spaceId);
    await renameSpace(input.spaceId, input.name);
    return { summary: `Space renamed to "${input.name}".` };
  },
});

const createSpaceTool = tool({
  name: "create_space",
  description:
    "Create a new schedule space (one per class section, max 5 per user). Returns the new " +
    "space's id.",
  shape: {
    name: z.string().min(1).max(60).describe("Space name, e.g. \"CSE-A Section 2\""),
  },
  handler: async (input, ctx) => {
    const space = await createSpaceForUser(ctx.userId, input.name);
    return { summary: `Created space "${space.name}" (id: ${space.id}).`, data: { spaceId: space.id } };
  },
});

/* --------------------------------- catalog --------------------------------- */

export const aiTools: AiTool[] = [
  // reads
  listSpaces, getSchedule, listUpcomingEvents,
  // temporary (default) changes
  rescheduleClassOnce, cancelClassOnce, changeRoomOnce, clearOverrideOnce,
  addExtraClassOnce, clearExtraClassOnce, setDayOffOnce, clearDayOffOnce,
  // permanent changes (gated)
  editPermanentSchedule, placeClassPermanently, removeClassPermanently,
  // courses
  addCourseTool, updateCourseTool, deleteCourseTool,
  // events
  addEventTool, updateEventTool, deleteEventTool,
  // space & settings
  updateSpaceSettingsTool, setChannelRouteTool, postTomorrowNowTool, renameSpaceTool, createSpaceTool,
];
