import { prisma } from "@/lib/prisma";
import { sendChannelMessage } from "@/lib/discord";
import { resolveChannel } from "@/lib/channels";
import { categoryMeta } from "@/lib/categories";
import { formatTime } from "@/lib/time";
import type { EventCategory } from "@/generated/prisma/enums";

// Announces a calendar event to the Discord channel its category routes to (or
// the space's main channel). Called by the event Server Actions after a create /
// edit / delete. It's best-effort: a missing channel or notifications-off just
// SKIPS — the action never fails because Discord did — and the soft result lets
// the UI show "saved, not posted".
//
// v1 posts a fresh message per change (no message-id bookkeeping), so an edit
// reads as an "Updated …" note rather than editing the original post.

export type AnnounceKind = "new" | "updated" | "cancelled";
export type AnnounceResult = { status: "sent" | "skipped" | "failed"; reason?: string };

// Same locale/UTC formatting as the digest's date label. We avoid the 📅 emoji
// on purpose (see digest.ts — Apple/Discord bake a fixed date into it); the real
// date is spelled out in a code span instead.
function eventDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type AnnounceEvent = {
  title: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  category: EventCategory;
  note: string | null;
  course: { name: string } | null;
};

export function formatEventAnnouncement(event: AnnounceEvent, kind: AnnounceKind, hour12: boolean): string {
  const meta = categoryMeta(event.category);
  const verb = kind === "new" ? "New" : kind === "updated" ? "Updated" : "Cancelled";
  const title = kind === "cancelled" ? `~~${event.title}~~` : event.title;
  const header = `${meta.emoji}  **${verb} ${meta.label} — ${title}**`;

  const when =
    event.startTime && event.endTime
      ? `  ·  \`${formatTime(event.startTime, hour12)}–${formatTime(event.endTime, hour12)}\``
      : event.startTime
        ? `  ·  \`${formatTime(event.startTime, hour12)}\``
        : "";

  const lines = [`\`${eventDateLabel(event.date)}\`${when}`];
  if (event.course?.name) lines.push(`📚  ${event.course.name}`);
  if (event.note) lines.push(`📝  ${event.note}`);

  return `${header}\n\n${lines.join("\n")}`;
}

export async function announceEvent(eventId: string, kind: AnnounceKind): Promise<AnnounceResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      space: { select: { notificationsEnabled: true, hour12: true } },
      course: { select: { name: true } },
    },
  });
  if (!event) return { status: "skipped", reason: "event not found" };
  if (!event.space.notificationsEnabled) return { status: "skipped", reason: "notifications off" };

  const channelId = await resolveChannel(event.spaceId, event.category);
  if (!channelId) return { status: "skipped", reason: "no channel" };

  const send = await sendChannelMessage(channelId, formatEventAnnouncement(event, kind, event.space.hour12));
  return send.ok ? { status: "sent" } : { status: "failed", reason: send.error };
}
