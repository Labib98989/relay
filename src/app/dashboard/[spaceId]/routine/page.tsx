import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/time";
import ScheduleEditor from "@/components/ScheduleEditor";
import { loadEditorData, editorActions } from "../editorData";

// The Weekly routine section: the PERMANENT weekly grid. This-week overrides live
// in the Dashboard section — this editor is pinned to "permanent" (no toggle).
export default async function RoutineSection({
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

  const data = await loadEditorData(spaceId, space.layout);
  const actions = editorActions(spaceId);
  const meta = space.discordChannelId
    ? `posts to Discord nightly at ${formatTime(space.postTime, space.hour12)}`
    : "channel not connected yet";

  return (
    <ScheduleEditor
      spaceName={space.name}
      meta={meta}
      hour12={space.hour12}
      lockMode="permanent"
      data={data}
      actions={actions}
    />
  );
}
