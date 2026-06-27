import { prisma } from "@/lib/prisma";
import { postDigestForSpace } from "@/lib/digest";
import { tomorrowUTC6, currentTimeHMUTC6 } from "@/lib/week";

// Nightly trigger. A cron on the host POSTs here with the shared secret:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/post
// For every space whose post time has arrived (UTC+6) and that has a channel +
// notifications on, it posts tomorrow's digest. PostLog idempotency means it's
// safe to run this every few minutes — each space posts once per date.

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const forDate = tomorrowUTC6();
  const nowHM = currentTimeHMUTC6();

  const spaces = await prisma.scheduleSpace.findMany({
    where: { discordChannelId: { not: null }, notificationsEnabled: true },
    select: { id: true, postTime: true },
  });

  const results: { spaceId: string; status: string; reason?: string }[] = [];
  for (const s of spaces) {
    if (s.postTime > nowHM) continue; // not due yet today
    const r = await postDigestForSpace(s.id, forDate);
    results.push({ spaceId: s.id, ...r });
  }

  return Response.json({
    forDate: forDate.toISOString().slice(0, 10),
    checkedAt: nowHM,
    posted: results.filter((r) => r.status === "sent").length,
    results,
  });
}
