import { prisma } from "@/lib/prisma";
import { resolveDay, type ResolvedDay } from "@/lib/resolve";
import { sendChannelMessage } from "@/lib/discord";
import { resolveChannel } from "@/lib/channels";
import { DIGEST_KEY, categoryMeta } from "@/lib/categories";
import { weekdayFromDate } from "@/lib/week";
import { formatTime } from "@/lib/time";
import { PostStatus } from "@/generated/prisma/enums";
import type { EventCategory } from "@/generated/prisma/enums";

// Turns a resolved day (+ that day's events) into the Discord message and posts
// it for a space, idempotently. The PostLog unique([spaceId, forDate]) constraint
// is the guard: once a date is posted successfully it's skipped, so the nightly
// cron can run as often as it likes without double-pinging. The digest goes to
// the "DIGEST" route channel, falling back to the space's main channel.

// The subset of an Event the digest needs. All-day events have null startTime.
export type DigestEvent = {
  title: string;
  category: EventCategory;
  startTime: string | null;
  endTime: string | null;
};

export function formatDigest(
  dateLabel: string,
  resolved: ResolvedDay,
  events: DigestEvent[] = [],
  hour12 = true,
): string {
  // 🔔 not 📅: the calendar emoji renders with a baked-in date ("JUL 17") on
  // Apple/Discord that never changes — misleading next to the real date below.
  const header = `🔔  **Tomorrow — ${dateLabel}**`;
  const parts: string[] = [header];

  // The classes block — a day off or a free day still gets a friendly note, and
  // (unlike before) the events block below is always appended after it.
  if (resolved.dayOff) {
    parts.push("🌙  Day off — no classes. Enjoy!");
  } else if (resolved.items.length === 0) {
    parts.push("🎉  No classes scheduled — free day.");
  } else {
    const lines = resolved.items.map((it) => {
      const tag = it.status === "extra" ? "  _(one-off)_" : it.status === "changed" ? "  _(changed)_" : "";
      const room = it.room ? ` · ${it.room}` : "";
      // Honour the space's display preference; times are still stored as 24h.
      const start = formatTime(it.startTime, hour12);
      const time = it.endTime ? `${start}–${formatTime(it.endTime, hour12)}` : start;
      return `\`${time}\`  **${it.name}**${room}${tag}`;
    });
    parts.push(lines.join("\n"));
  }

  // The events block — exams, assignments, notices… due tomorrow. Shown even on
  // a day off / free day (those early-returned before). All-day events sort first.
  if (events.length) {
    const sorted = [...events].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    const lines = sorted.map((e) => {
      const meta = categoryMeta(e.category);
      const time = e.startTime
        ? e.endTime
          ? `\`${formatTime(e.startTime, hour12)}–${formatTime(e.endTime, hour12)}\`  `
          : `\`${formatTime(e.startTime, hour12)}\`  `
        : "";
      return `${meta.emoji}  ${time}**${e.title}**  _(${meta.label})_`;
    });
    parts.push(`📌  **Events**\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}

export type DigestResult = { status: "sent" | "failed" | "skipped"; reason?: string };

export async function postDigestForSpace(
  spaceId: string,
  forDate: Date,
  opts: { force?: boolean } = {},
): Promise<DigestResult> {
  const space = await prisma.scheduleSpace.findUnique({ where: { id: spaceId } });
  if (!space) return { status: "skipped", reason: "space not found" };
  if (!space.notificationsEnabled && !opts.force)
    return { status: "skipped", reason: "notifications off" };

  // Where the digest goes: the DIGEST route, or the main channel as fallback.
  const channelId = await resolveChannel(spaceId, DIGEST_KEY);
  if (!channelId) return { status: "skipped", reason: "no channel connected" };

  // idempotency: a prior SUCCESS for this date means we're done.
  const existing = await prisma.postLog.findUnique({
    where: { spaceId_forDate: { spaceId, forDate } },
  });
  if (existing?.status === PostStatus.SUCCESS && !opts.force)
    return { status: "skipped", reason: "already posted" };

  const weekday = weekdayFromDate(forDate);
  const [slots, overrides, events] = await Promise.all([
    prisma.scheduleSlot.findMany({ where: { spaceId, weekday }, include: { course: true } }),
    prisma.override.findMany({ where: { spaceId, date: forDate }, include: { course: true } }),
    prisma.event.findMany({
      where: { spaceId, date: forDate },
      select: { title: true, category: true, startTime: true, endTime: true },
    }),
  ]);
  const resolved = resolveDay(forDate, slots, overrides);
  const label = forDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const send = await sendChannelMessage(channelId, formatDigest(label, resolved, events, space.hour12));

  await prisma.postLog.upsert({
    where: { spaceId_forDate: { spaceId, forDate } },
    create: {
      spaceId,
      forDate,
      status: send.ok ? PostStatus.SUCCESS : PostStatus.FAILED,
      error: send.error ?? null,
    },
    update: {
      status: send.ok ? PostStatus.SUCCESS : PostStatus.FAILED,
      error: send.error ?? null,
      sentAt: new Date(),
    },
  });

  return send.ok ? { status: "sent" } : { status: "failed", reason: send.error };
}
