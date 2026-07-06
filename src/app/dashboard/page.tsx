import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/time";
import AppHeader from "@/components/AppHeader";
import Brand from "@/components/Brand";
import Mascot from "@/components/Mascot";
import { createSpace, deleteSpace } from "./actions";
import { MAX_SPACES_PER_USER } from "./constants";

// A friendly accent per space so the grid reads like a shelf of labelled tabs.
const ACCENTS = ["#f4632e", "#2f93e6", "#15b886", "#e8467c", "#f3b324"];

export default async function Dashboard() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }

  const spaces = await prisma.scheduleSpace.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  const atLimit = spaces.length >= MAX_SPACES_PER_USER;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        left={<Brand />}
        right={
          <>
            <div className="flex items-center gap-2">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt=""
                  width={30}
                  height={30}
                  className="rounded-full ring-2 ring-line"
                />
              )}
              <span className="hidden text-sm font-semibold text-ink-soft sm:block">
                {session.user.name}
              </span>
            </div>
            <Link
              href="/dashboard/account"
              className="rounded-lg px-2 py-1 font-mono text-xs text-ink-faint transition-colors hover:text-brand"
            >
              AI access
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg px-2 py-1 font-mono text-xs text-ink-faint transition-colors hover:text-brand"
              >
                sign out
              </button>
            </form>
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        {/* title row + slot counter */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
              Your schedule spaces
            </h1>
            <p className="mt-1 text-ink-soft">
              One space per class section — its schedule and the channel it posts to.
            </p>
          </div>
          <SlotCounter used={spaces.length} max={MAX_SPACES_PER_USER} />
        </div>

        {spaces.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space, i) => (
              <li key={space.id} className="panel group relative overflow-hidden p-0">
                {/* colored tab strip */}
                <span
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ background: ACCENTS[i % ACCENTS.length] }}
                />
                <Link href={`/dashboard/${space.id}`} className="block p-5 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-xl font-bold text-ink transition-colors group-hover:text-brand">
                      {space.name}
                    </h2>
                    <span className="mt-0.5 text-ink-faint transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ink-soft">
                      posts {formatTime(space.postTime, space.hour12)}
                    </span>
                    {space.discordChannelId ? (
                      <span className="rounded-full bg-mint-tint px-2.5 py-1 font-mono text-[11px] font-semibold text-mint-deep">
                        ● connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-gold/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-gold-deep">
                        ○ connect channel
                      </span>
                    )}
                  </div>
                </Link>
                <form action={deleteSpace} className="absolute bottom-3 right-3">
                  <input type="hidden" name="id" value={space.id} />
                  <button
                    type="submit"
                    aria-label={`Delete ${space.name}`}
                    className="rounded-lg p-1.5 text-ink-faint opacity-0 transition-all hover:bg-berry/10 hover:text-berry focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* create form */}
        {!atLimit && (
          <form
            action={createSpace}
            className="panel mt-6 flex max-w-xl flex-col gap-3 p-5 sm:flex-row sm:items-center"
          >
            <input
              name="name"
              required
              maxLength={60}
              placeholder="New space — e.g. CSE-A, Section 2"
              className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
            />
            <button type="submit" className="pressable px-5 py-3">
              + Create space
            </button>
          </form>
        )}
        {atLimit && (
          <p className="mt-6 font-mono text-xs text-ink-faint">
            You&apos;ve filled all {MAX_SPACES_PER_USER} spaces — delete one to add another.
          </p>
        )}
      </main>
    </div>
  );
}

/* ------------------------------- sub-pieces ------------------------------- */

function SlotCounter({ used, max }: { used: number; max: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      <div className="flex gap-1.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i < used ? "bg-brand" : "bg-line-strong"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-ink-soft">
        {used}/{max}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel mat mt-8 flex flex-col items-center gap-4 px-6 py-14 text-center">
      <Mascot size={92} className="animate-float" />
      <h2 className="font-display text-2xl font-bold text-ink">
        Let&apos;s set up your first section
      </h2>
      <p className="max-w-md text-ink-soft">
        A space holds one section&apos;s weekly schedule and the Discord channel it
        posts to. Name it below and Guy will help you build the timetable.
      </p>
      <span className="font-mono text-xs text-ink-faint">↓ create one to get started</span>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12a1 1 0 0 1-1 1H7.7a1 1 0 0 1-1-1L6 7" />
    </svg>
  );
}
