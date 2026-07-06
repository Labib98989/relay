import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ChatPanel from "@/components/ChatPanel";
// @relay-test-button — temporary manual pipeline pokes; grep this tag to remove.
import ChatTestControls from "@/components/ChatTestControls";

// The AI assistant section — same shell as Settings: auth + ownership gate,
// then a client panel. The chat API route re-checks ownership on every call;
// this page's check just keeps the URL honest.
export default async function ChatSection({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { spaceId } = await params;

  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: session.user.id },
    select: { id: true, name: true },
  });
  if (!space) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-ink">Assistant</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Manage “{space.name}” by chatting — schedule changes, events, settings.
      </p>
      {/* @relay-test-button — temporary manual pipeline pokes; grep this tag to remove. */}
      <ChatTestControls spaceId={space.id} />
      <div className="panel flex flex-1 flex-col p-4">
        <ChatPanel spaceId={space.id} />
      </div>
    </div>
  );
}
