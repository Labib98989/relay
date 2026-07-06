import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { todayUTC6 } from "@/lib/week";
import { pad2 } from "@/lib/time";
import CalendarView from "@/components/CalendarView";
import { addEvent, updateEvent, deleteEvent } from "../actions";

// The Calendar & events section. The visible month comes from ?m=YYYY-MM; the
// ±12-month navigation clamp is enforced here (prev/next null at the edges), so
// the client calendar only ever renders the month it's handed. `params` and
// `searchParams` are Promises in this Next.js — both must be awaited.
export default async function CalendarSection({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { spaceId } = await params;
  const { m } = await searchParams;

  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: session.user.id },
    select: { id: true, hour12: true },
  });
  if (!space) notFound();

  const today = todayUTC6();
  const curIdx = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const minIdx = curIdx - 12;
  const maxIdx = curIdx + 12;

  // Parse ?m=YYYY-MM, default to the current month, clamp into the ±12 window.
  let viewIdx = curIdx;
  const parsed = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  if (parsed) viewIdx = Number(parsed[1]) * 12 + (Number(parsed[2]) - 1);
  viewIdx = Math.max(minIdx, Math.min(maxIdx, viewIdx));
  const year = Math.floor(viewIdx / 12);
  const month = (viewIdx % 12) + 1;

  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));

  const [events, courses] = await Promise.all([
    prisma.event.findMany({
      where: { spaceId, date: { gte: first, lte: last } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.course.findMany({ where: { spaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const idxToYM = (idx: number) => `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;

  const calEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    date: ymd(e.date),
    category: e.category,
    startTime: e.startTime,
    endTime: e.endTime,
    courseId: e.courseId,
    note: e.note,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-4 font-display text-2xl font-extrabold tracking-tight text-ink">Calendar &amp; events</h1>
      <CalendarView
        year={year}
        month={month}
        monthLabel={first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
        todayYMD={ymd(today)}
        events={calEvents}
        courses={courses}
        hour12={space.hour12}
        prevMonth={viewIdx - 1 >= minIdx ? idxToYM(viewIdx - 1) : null}
        nextMonth={viewIdx + 1 <= maxIdx ? idxToYM(viewIdx + 1) : null}
        actions={{
          addEvent: addEvent.bind(null, spaceId),
          updateEvent,
          deleteEvent,
        }}
      />
    </div>
  );
}
