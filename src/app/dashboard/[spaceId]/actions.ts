"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Weekday, OverrideType } from "@/generated/prisma/enums";
import { upcomingDateForWeekday, tomorrowUTC6 } from "@/lib/week";
import { postDigestForSpace, type DigestResult } from "@/lib/digest";
import { isHM } from "@/lib/time";
import { sanitizeLayout, type Layout } from "@/lib/layout";

// Every action re-derives the signed-in user and scopes its query to data they
// own. Server Actions are reachable by direct POST, so ownership is enforced
// HERE in the query (a non-owner's id simply matches zero rows), never in the UI.

async function userId(): Promise<string> {
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

const touch = (spaceId: string) => revalidatePath(`/dashboard/${spaceId}`);

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
  fields: { type: OverrideType; room?: string | null },
): Promise<void> {
  const slot = await ownedSlot(slotId);
  const date = upcomingDateForWeekday(slot.weekday);
  // One override per (slot, date): clear then write, so toggling is idempotent.
  await prisma.override.deleteMany({ where: { spaceId: slot.spaceId, slotId, date } });
  await prisma.override.create({
    data: {
      spaceId: slot.spaceId,
      slotId,
      date,
      type: fields.type,
      room: fields.room ?? null,
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
