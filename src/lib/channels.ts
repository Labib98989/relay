import { prisma } from "@/lib/prisma";
import type { RouteKey } from "@/lib/categories";

// Resolve which Discord channel a given post target (the nightly "DIGEST", or an
// event category) goes to for a space. A per-key ChannelRoute wins; otherwise we
// fall back to the space's main channel (ScheduleSpace.discordChannelId). Null
// means "nowhere to post" — the caller skips cleanly.
export async function resolveChannel(spaceId: string, key: RouteKey): Promise<string | null> {
  const [route, space] = await Promise.all([
    prisma.channelRoute.findUnique({
      where: { spaceId_key: { spaceId, key } },
      select: { channelId: true },
    }),
    prisma.scheduleSpace.findUnique({
      where: { id: spaceId },
      select: { discordChannelId: true },
    }),
  ]);
  return route?.channelId ?? space?.discordChannelId ?? null;
}
