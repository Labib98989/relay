import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { weekWindowUTC6, weekdayFromDate, tomorrowUTC6 } from "@/lib/week";
import { resolveDay } from "@/lib/resolve";
import { formatTime } from "@/lib/time";
import { categoryMeta } from "@/lib/categories";
import ScheduleEditor from "@/components/ScheduleEditor";
import TomorrowPreview from "@/components/TomorrowPreview";
import { loadEditorData, editorActions } from "./editorData";

// The Dashboard section: the day-to-day operational view — tomorrow's post, a
// glance at upcoming events, and the "This week" temporary editor. The permanent
// weekly grid lives in the Weekly routine section.
export default async function DashboardSection({
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

  const tomorrow = tomorrowUTC6();
  const tomorrowWeekday = weekdayFromDate(tomorrow);
  const { start, end } = weekWindowUTC6();
  const [tmrSlots, tmrOverrides, tmrEvents, upcoming] = await Promise.all([
    prisma.scheduleSlot.findMany({ where: { spaceId, weekday: tomorrowWeekday }, include: { course: true } }),
    prisma.override.findMany({ where: { spaceId, date: tomorrow }, include: { course: true } }),
    prisma.event.findMany({
      where: { spaceId, date: tomorrow },
      select: { title: true, category: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.event.findMany({
      where: { spaceId, date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);

  const resolved = resolveDay(tomorrow, tmrSlots, tmrOverrides);
  const dateLabel = tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const connected = !!space.discordChannelId;
  const meta = connected
    ? `posts to Discord nightly at ${formatTime(space.postTime, space.hour12)}`
    : "channel not connected yet";

  return (
    <>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-8 sm:px-6 md:grid-cols-2">
        <TomorrowPreview
          resolved={resolved}
          dateLabel={dateLabel}
          postTime={space.postTime}
          connected={connected}
          hour12={space.hour12}
          events={tmrEvents}
        />
        <UpcomingEvents events={upcoming} hour12={space.hour12} spaceId={spaceId} />
      </div>

      <ScheduleEditor
        spaceName={space.name}
        meta={meta}
        hour12={space.hour12}
        lockMode="week"
        data={data}
        actions={actions}
      />
    </>
  );
}

function UpcomingEvents({
  events,
  hour12,
  spaceId,
}: {
  events: { id: string; title: string; date: Date; category: import("@/generated/prisma/enums").EventCategory; startTime: string | null }[];
  hour12: boolean;
  spaceId: string;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">next 7 days</div>
          <h2 className="font-display text-lg font-bold text-ink">Upcoming events</h2>
        </div>
        <a href={`/dashboard/${spaceId}/calendar`} className="font-mono text-[11px] text-ink-soft transition-colors hover:text-brand">
          calendar →
        </a>
      </div>
      <div className="p-5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <span className="text-2xl">🗓️</span>
            <p className="font-semibold text-ink">Nothing coming up.</p>
            <p className="text-sm text-ink-soft">Add exams and deadlines in Calendar &amp; events.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => {
              const meta = categoryMeta(e.category);
              const label = e.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
              return (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-ink-faint">{label}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{e.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                    {e.startTime ? formatTime(e.startTime, hour12) : meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
