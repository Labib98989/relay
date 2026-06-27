import { prisma } from "@/lib/prisma";
import { resolveDay, type ResolvedDay } from "@/lib/resolve";
import { sendChannelMessage } from "@/lib/discord";
import { weekdayFromDate } from "@/lib/week";
import { formatTime } from "@/lib/time";
import { PostStatus } from "@/generated/prisma/enums";

// Turns a resolved day into the Discord message and posts it for a space,
// idempotently. The PostLog unique([spaceId, forDate]) constraint is the guard:
// once a date is posted successfully it's skipped, so the nightly cron can run
// as often as it likes without double-pinging.

export function formatDigest(dateLabel: string, resolved: ResolvedDay, hour12 = true): string {
  // 🔔 not 📅: the calendar emoji renders with a baked-in date ("JUL 17") on
  // Apple/Discord that never changes — misleading next to the real date below.
  const header = `🔔  **Tomorrow — ${dateLabel}**`;
  if (resolved.dayOff) return `${header}\n\n🌙  Day off — no classes. Enjoy!`;
  if (resolved.items.length === 0) return `${header}\n\n🎉  No classes scheduled — free day.`;

  const lines = resolved.items.map((it) => {
    const tag = it.status === "extra" ? "  _(one-off)_" : it.status === "changed" ? "  _(changed)_" : "";
    const room = it.room ? ` · ${it.room}` : "";
    // Honour the space's display preference; times are still stored as 24h.
    const start = formatTime(it.startTime, hour12);
    const time = it.endTime ? `${start}–${formatTime(it.endTime, hour12)}` : start;
    return `\`${time}\`  **${it.name}**${room}${tag}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

export type DigestResult = { status: "sent" | "failed" | "skipped"; reason?: string };

export async function postDigestForSpace(
  spaceId: string,
  forDate: Date,
  opts: { force?: boolean } = {},
): Promise<DigestResult> {
  const space = await prisma.scheduleSpace.findUnique({ where: { id: spaceId } });
  if (!space) return { status: "skipped", reason: "space not found" };
  if (!space.discordChannelId) return { status: "skipped", reason: "no channel connected" };
  if (!space.notificationsEnabled && !opts.force)
    return { status: "skipped", reason: "notifications off" };

  // idempotency: a prior SUCCESS for this date means we're done.
  const existing = await prisma.postLog.findUnique({
    where: { spaceId_forDate: { spaceId, forDate } },
  });
  if (existing?.status === PostStatus.SUCCESS && !opts.force)
    return { status: "skipped", reason: "already posted" };

  const weekday = weekdayFromDate(forDate);
  const [slots, overrides] = await Promise.all([
    prisma.routineSlot.findMany({ where: { spaceId, weekday }, include: { course: true } }),
    prisma.override.findMany({ where: { spaceId, date: forDate }, include: { course: true } }),
  ]);
  const resolved = resolveDay(forDate, slots, overrides);
  const label = forDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const send = await sendChannelMessage(space.discordChannelId, formatDigest(label, resolved, space.hour12));

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
