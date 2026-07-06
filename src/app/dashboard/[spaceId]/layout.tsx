import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "@/components/AppHeader";
import Brand from "@/components/Brand";
import SpaceSidebar from "@/components/SpaceSidebar";

// The shell every in-space section renders inside. It checks ownership ONCE
// (`params` is a Promise in this Next.js — must be awaited), loads the switcher's
// space list, and frames the sidebar + the active section (`children`).
export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { spaceId } = await params;

  // Ownership is enforced in the query: another CR's space id finds nothing.
  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: session.user.id },
    select: { id: true, name: true },
  });
  if (!space) notFound();

  const spaces = await prisma.scheduleSpace.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        left={<Brand />}
        right={
          <>
            <div className="flex items-center gap-2">
              {session.user.image && (
                <Image src={session.user.image} alt="" width={30} height={30} className="rounded-full ring-2 ring-line" />
              )}
              <span className="hidden text-sm font-semibold text-ink-soft sm:block">{session.user.name}</span>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="rounded-lg px-2 py-1 font-mono text-xs text-ink-faint transition-colors hover:text-brand">
                sign out
              </button>
            </form>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <SpaceSidebar spaceId={space.id} spaceName={space.name} spaces={spaces} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
