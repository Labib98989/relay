"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Weekday, OverrideType } from "@/generated/prisma/enums";
import type { EventCategory } from "@/generated/prisma/enums";
import { upcomingDateForWeekday, tomorrowUTC6 } from "@/lib/week";
import { postDigestForSpace, type DigestResult } from "@/lib/digest";
import { isHM } from "@/lib/time";
import { sanitizeLayout, type Layout } from "@/lib/layout";
import { isEventCategory, DIGEST_KEY, type RouteKey } from "@/lib/categories";
import { announceEvent, type AnnounceResult } from "@/lib/events-post";
import { currentActorUserId } from "@/lib/ai/actor";

// Every action re-derives the signed-in user and scopes its query to data they
// own. Server Actions are reachable by direct POST, so ownership is enforced
// HERE in the query (a non-owner's id simply matches zero rows), never in the UI.

async function userId(): Promise<string> {
  // AI transports (MCP / GPT Actions / in-app chat) verify the caller outside
  // the cookie session and provide the acting user via AsyncLocalStorage.
  const actor = currentActorUserId();
  if (actor) return actor;
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

async function assertOwnedSpace(spaceId: string): Promise<void> {
  const uid = await userId();
  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: uid },
    select: { id: true },
  });
  if (!space) throw new Error("Space not found");
}

// Returns the slot only if it belongs to the caller — with its space + weekday.
async function ownedSlot(slotId: string) {
  const uid = await userId();
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, space: { ownerId: uid } },
    select: { id: true, spaceId: true, weekday: true },
  });
  if (!slot) throw new Error("Slot not found");
  return slot;
}

async function ownedCourseSpace(courseId: string): Promise<string> {
  const uid = await userId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, space: { ownerId: uid } },
    select: { spaceId: true },
  });
  if (!course) throw new Error("Course not found");
  return course.spaceId;
}

// Revalidate the whole space LAYOUT, not just one page: an edit in any section
// (routine, calendar, settings) can change what another section shows (e.g. a
// renamed space in the sidebar, or an event in the dashboard glance).
const touch = (spaceId: string) => revalidatePath(`/dashboard/${spaceId}`, "layout");

/* -------------------------------- courses --------------------------------- */

export async function addCourse(
  spaceId: string,
  name: string,
  color: string,
  room: string,
): Promise<{ id: string }> {
  await assertOwnedSpace(spaceId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Course name is required");
  const course = await prisma.course.create({
    data: { spaceId, name: trimmed.slice(0, 80), color, room: room.trim() || null },
  });
  touch(spaceId);
  return { id: course.id };
}

export async function updateCourse(
  courseId: string,
  data: { name?: string; room?: string; color?: string },
): Promise<void> {
  const spaceId = await ownedCourseSpace(courseId);
  await prisma.course.update({
    where: { id: courseId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim().slice(0, 80) } : {}),
      ...(data.room !== undefined ? { room: data.room.trim() || null } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });
  touch(spaceId);
}

export async function deleteCourse(courseId: string): Promise<void> {
  const spaceId = await ownedCourseSpace(courseId);
  // Cascades remove this course's slots, and those slots' overrides (see schema).
  await prisma.course.delete({ where: { id: courseId } });
  touch(spaceId);
}

/* ------------------------- permanent layer: slots ------------------------- */

// A grid "cell" is (space, weekday, startTime). Placing replaces whatever sat
// there, so a cell holds at most one class.
export async function placeSlot(
  spaceId: string,
  courseId: string,
  weekday: Weekday,
  startTime: string,
  endTime: string,
): Promise<{ id: string }> {
  await assertOwnedSpace(spaceId);
  if (!isHM(startTime) || !isHM(endTime)) throw new Error("Times must be HH:MM");
  // Make sure the course is in this very space (not just owned somewhere).
  const course = await prisma.course.findFirst({
    where: { id: courseId, spaceId },
    select: { id: true },
  });
  if (!course) throw new Error("Course not in this space");

  await prisma.scheduleSlot.deleteMany({ where: { spaceId, weekday, startTime } });
  const slot = await prisma.scheduleSlot.create({
    data: { spaceId, courseId, weekday, startTime, endTime },
  });
  touch(spaceId);
  return { id: slot.id };
}

export async function removeSlot(slotId: string): Promise<void> {
  const slot = await ownedSlot(slotId);
  await prisma.scheduleSlot.delete({ where: { id: slot.id } });
  touch(slot.spaceId);
}

// Editing a time row retimes every slot sharing that band. Ownership is enforced
// inside the filter, so unowned ids in the list are silently skipped.
export async function setSlotTimes(
  slotIds: string[],
  startTime: string,
  endTime: string,
): Promise<void> {
  if (slotIds.length === 0) return;
  if (!isHM(startTime) || !isHM(endTime)) throw new Error("Times must be HH:MM");
  const uid = await userId();
  const result = await prisma.scheduleSlot.updateMany({
    where: { id: { in: slotIds }, space: { ownerId: uid } },
    data: { startTime, endTime },
  });
  // Revalidate via any owned slot's space.
  const any = await prisma.scheduleSlot.findFirst({
    where: { id: { in: slotIds }, space: { ownerId: uid } },
    select: { spaceId: true },
  });
  if (result.count > 0 && any) touch(any.spaceId);
}

/* ----------------------- temporary layer: this week ----------------------- */

async function replaceOverride(
  slotId: string,
  fields: { type: OverrideType; room?: string | null; startTime?: string | null; endTime?: string | null },
): Promise<void> {
  const slot = await ownedSlot(slotId);
  const date = upcomingDateForWeekday(slot.weekday);
  // One override per (slot, date): clear then write, so toggling is idempotent.
  // A CHANGED row can carry a room AND a time move; when the caller sets only
  // one of them, merge the other from the existing row instead of wiping it
  // (a room edit must not undo an earlier time move, and vice versa).
  const existing = await prisma.override.findFirst({
    where: { spaceId: slot.spaceId, slotId, date },
    select: { type: true, room: true, startTime: true, endTime: true },
  });
  const keep = fields.type === OverrideType.CHANGED && existing?.type === OverrideType.CHANGED ? existing : null;
  await prisma.override.deleteMany({ where: { spaceId: slot.spaceId, slotId, date } });
  await prisma.override.create({
    data: {
      spaceId: slot.spaceId,
      slotId,
      date,
      type: fields.type,
      room: fields.room !== undefined ? fields.room : keep?.room ?? null,
      startTime: fields.startTime !== undefined ? fields.startTime : keep?.startTime ?? null,
      endTime: fields.endTime !== undefined ? fields.endTime : keep?.endTime ?? null,
    },
  });
  touch(slot.spaceId);
}

export async function cancelThisWeek(slotId: string): Promise<void> {
  await replaceOverride(slotId, { type: OverrideType.CANCELLED });
}

export async function changeRoomThisWeek(slotId: string, room: string): Promise<void> {
  await replaceOverride(slotId, { type: OverrideType.CHANGED, room: room.trim() });
}

// Move ONE occurrence (the upcoming one) to a new time band — the temporary
// counterpart of setSlotTimes. The permanent slot is untouched; resolveDay
// already renders CHANGED times, so the digest and preview pick this up as-is.
export async function changeTimeThisWeek(
  slotId: string,
  startTime: string,
  endTime: string,
  room?: string,
): Promise<void> {
  if (!isHM(startTime) || !isHM(endTime)) throw new Error("Times must be HH:MM");
  await replaceOverride(slotId, {
    type: OverrideType.CHANGED,
    startTime,
    endTime,
    ...(room !== undefined ? { room: room.trim() || null } : {}),
  });
}

export async function clearThisWeek(slotId: string): Promise<void> {
  const slot = await ownedSlot(slotId);
  const date = upcomingDateForWeekday(slot.weekday);
  await prisma.override.deleteMany({ where: { spaceId: slot.spaceId, slotId, date } });
  touch(slot.spaceId);
}

/* ---------------- temporary layer: one-off extras & day off --------------- */

// EXTRA: a class that happens this week only and isn't in the schedule. Keyed by
// (space, date, startTime) so re-adding in the same cell replaces it.
export async function addExtraThisWeek(
  spaceId: string,
  courseId: string,
  weekday: Weekday,
  startTime: string,
  endTime: string,
  room: string,
): Promise<{ id: string }> {
  await assertOwnedSpace(spaceId);
  if (!isHM(startTime) || !isHM(endTime)) throw new Error("Times must be HH:MM");
  const course = await prisma.course.findFirst({
    where: { id: courseId, spaceId },
    select: { id: true },
  });
  if (!course) throw new Error("Course not in this space");
  const date = upcomingDateForWeekday(weekday);
  await prisma.override.deleteMany({
    where: { spaceId, date, type: OverrideType.EXTRA, startTime },
  });
  const ov = await prisma.override.create({
    data: {
      spaceId,
      date,
      type: OverrideType.EXTRA,
      courseId,
      startTime,
      endTime,
      room: room.trim() || null,
    },
  });
  touch(spaceId);
  return { id: ov.id };
}

export async function clearExtraThisWeek(
  spaceId: string,
  weekday: Weekday,
  startTime: string,
): Promise<void> {
  await assertOwnedSpace(spaceId);
  const date = upcomingDateForWeekday(weekday);
  await prisma.override.deleteMany({
    where: { spaceId, date, type: OverrideType.EXTRA, startTime },
  });
  touch(spaceId);
}

// DAY_OFF: the whole day is off this week — one row per (space, date).
export async function setDayOff(spaceId: string, weekday: Weekday): Promise<void> {
  await assertOwnedSpace(spaceId);
  const date = upcomingDateForWeekday(weekday);
  await prisma.override.deleteMany({ where: { spaceId, date, type: OverrideType.DAY_OFF } });
  await prisma.override.create({ data: { spaceId, date, type: OverrideType.DAY_OFF } });
  touch(spaceId);
}

export async function clearDayOff(spaceId: string, weekday: Weekday): Promise<void> {
  await assertOwnedSpace(spaceId);
  const date = upcomingDateForWeekday(weekday);
  await prisma.override.deleteMany({ where: { spaceId, date, type: OverrideType.DAY_OFF } });
  touch(spaceId);
}

/* ------------------------------ space settings ---------------------------- */

export async function updateSpaceSettings(
  spaceId: string,
  data: { discordChannelId?: string; postTime?: string; notificationsEnabled?: boolean; hour12?: boolean },
): Promise<void> {
  await assertOwnedSpace(spaceId);
  if (data.postTime !== undefined && !/^\d{2}:\d{2}$/.test(data.postTime)) {
    throw new Error("Post time must be HH:MM");
  }
  // Discord channel IDs are numeric snowflakes; keep only digits, null if blank.
  const channel = data.discordChannelId?.replace(/\D/g, "") || null;
  await prisma.scheduleSpace.update({
    where: { id: spaceId },
    data: {
      ...(data.discordChannelId !== undefined ? { discordChannelId: channel } : {}),
      ...(data.postTime !== undefined ? { postTime: data.postTime } : {}),
      ...(data.notificationsEnabled !== undefined ? { notificationsEnabled: data.notificationsEnabled } : {}),
      ...(data.hour12 !== undefined ? { hour12: data.hour12 } : {}),
    },
  });
  touch(spaceId);
}

// Persist the editor scaffold (time rows + weekend layout). Sanitized at this
// trust boundary — a direct POST can't store a malformed row or a junk weekday.
export async function updateLayout(spaceId: string, layout: Layout): Promise<void> {
  await assertOwnedSpace(spaceId);
  const clean = sanitizeLayout(layout);
  if (!clean) throw new Error("Invalid layout");
  await prisma.scheduleSpace.update({
    where: { id: spaceId },
    data: { layout: clean },
  });
  touch(spaceId);
}

// Manual "send tomorrow's digest right now" — bypasses the due-time and
// already-posted guards so the CR can test their channel wiring.
export async function postTomorrowNow(spaceId: string): Promise<DigestResult> {
  await assertOwnedSpace(spaceId);
  const result = await postDigestForSpace(spaceId, tomorrowUTC6(), { force: true });
  touch(spaceId);
  return result;
}

/* ----------------------------- calendar events ---------------------------- */

// A stored @db.Date is UTC-midnight of a calendar day; the calendar UI speaks
// plain "YYYY-MM-DD" (UTC+6 wall-clock), so we anchor it to UTC midnight to match
// Override.date. See src/lib/week.ts for the same convention.
function dateFromYMD(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) throw new Error("Date must be YYYY-MM-DD");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

export type EventInput = {
  title: string;
  date: string; // "YYYY-MM-DD" (UTC+6 wall-clock)
  category: EventCategory;
  startTime?: string | null; // optional "HH:MM"; omit for all-day
  endTime?: string | null;
  courseId?: string | null;
  note?: string | null;
};

// Validate + normalize an event payload at the trust boundary (Server Actions are
// reachable by direct POST). Returns the exact Prisma `data` shape. `spaceId` is
// used to confirm any linked course actually belongs to this space.
async function cleanEventInput(spaceId: string, input: EventInput) {
  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!isEventCategory(input.category)) throw new Error("Unknown category");

  const start = input.startTime?.trim() || null;
  let end = input.endTime?.trim() || null;
  if (start && !isHM(start)) throw new Error("Start time must be HH:MM");
  if (end && !isHM(end)) throw new Error("End time must be HH:MM");
  if (!start) end = null; // no end without a start (all-day has neither)

  let courseId = input.courseId?.trim() || null;
  if (courseId) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, spaceId },
      select: { id: true },
    });
    if (!course) courseId = null; // stale link → just drop it, don't fail the save
  }

  return {
    title: title.slice(0, 120),
    date: dateFromYMD(input.date),
    category: input.category,
    startTime: start,
    endTime: end,
    courseId,
    note: input.note?.trim().slice(0, 500) || null,
  };
}

async function ownedEvent(eventId: string): Promise<{ id: string; spaceId: string }> {
  const uid = await userId();
  const event = await prisma.event.findFirst({
    where: { id: eventId, space: { ownerId: uid } },
    select: { id: true, spaceId: true },
  });
  if (!event) throw new Error("Event not found");
  return event;
}

export async function addEvent(
  spaceId: string,
  input: EventInput,
): Promise<{ id: string; posted: AnnounceResult }> {
  await assertOwnedSpace(spaceId);
  const data = await cleanEventInput(spaceId, input);
  const event = await prisma.event.create({ data: { spaceId, ...data } });
  const posted = await announceEvent(event.id, "new");
  touch(spaceId);
  return { id: event.id, posted };
}

export async function updateEvent(
  eventId: string,
  input: EventInput,
): Promise<{ posted: AnnounceResult }> {
  const { spaceId } = await ownedEvent(eventId);
  const data = await cleanEventInput(spaceId, input);
  await prisma.event.update({ where: { id: eventId }, data });
  const posted = await announceEvent(eventId, "updated");
  touch(spaceId);
  return { posted };
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { spaceId } = await ownedEvent(eventId);
  // Announce the cancellation while the row still exists, THEN delete it.
  await announceEvent(eventId, "cancelled");
  await prisma.event.delete({ where: { id: eventId } });
  touch(spaceId);
}

/* ---------------------------- channel routing ----------------------------- */

// Map a post target (the nightly "DIGEST", or an event category) to a channel.
// A blank id clears the route → that target falls back to the main channel.
export async function setChannelRoute(
  spaceId: string,
  key: RouteKey,
  channelId: string | null,
): Promise<void> {
  await assertOwnedSpace(spaceId);
  if (key !== DIGEST_KEY && !isEventCategory(key)) throw new Error("Invalid route key");
  // Discord channel IDs are numeric snowflakes; keep only digits.
  const clean = channelId?.replace(/\D/g, "") || null;
  if (clean) {
    await prisma.channelRoute.upsert({
      where: { spaceId_key: { spaceId, key } },
      create: { spaceId, key, channelId: clean },
      update: { channelId: clean },
    });
  } else {
    await prisma.channelRoute.deleteMany({ where: { spaceId, key } });
  }
  touch(spaceId);
}

/* -------------------------------- space name ------------------------------ */

export async function renameSpace(spaceId: string, name: string): Promise<void> {
  await assertOwnedSpace(spaceId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Space name is required");
  if (trimmed.length > 60) throw new Error("Space name is too long");
  await prisma.scheduleSpace.update({ where: { id: spaceId }, data: { name: trimmed } });
  touch(spaceId);
}
