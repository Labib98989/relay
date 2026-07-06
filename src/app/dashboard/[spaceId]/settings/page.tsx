import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsPanel from "@/components/SettingsPanel";
import { updateSpaceSettings, setChannelRoute, postTomorrowNow, renameSpace } from "../actions";
import { deleteSpace } from "../../actions";

// The Settings section: channel routing (main + per-target), posting prefs,
// rename, and delete. All writes go through space-scoped Server Actions.
export default async function SettingsSection({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { spaceId } = await params;

  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: session.user.id },
  });
  if (!space) notFound();

  const routeRows = await prisma.channelRoute.findMany({ where: { spaceId } });
  const routes: Record<string, string> = {};
  for (const r of routeRows) routes[r.key] = r.channelId;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-4 font-display text-2xl font-extrabold tracking-tight text-ink">Settings</h1>
      <SettingsPanel
        spaceId={spaceId}
        initial={{
          name: space.name,
          channelId: space.discordChannelId ?? "",
          postTime: space.postTime,
          notificationsEnabled: space.notificationsEnabled,
          hour12: space.hour12,
          routes,
        }}
        actions={{
          updateSettings: updateSpaceSettings.bind(null, spaceId),
          setChannelRoute: setChannelRoute.bind(null, spaceId),
          postNow: postTomorrowNow.bind(null, spaceId),
          rename: renameSpace.bind(null, spaceId),
        }}
        deleteAction={deleteSpace}
      />
    </div>
  );
}
