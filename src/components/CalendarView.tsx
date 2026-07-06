"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Popover from "@/components/ui/Popover";
import EventForm, { type CourseLite, type EventDraft } from "@/components/EventForm";
import { categoryMeta, GROUP_LABELS, type CategoryGroup } from "@/lib/categories";
import { formatTime, pad2 } from "@/lib/time";
import type { EventInput } from "@/app/dashboard/[spaceId]/actions";
import type { AnnounceResult } from "@/lib/events-post";

// A calendar event as the calendar needs it — same shape the form edits.
export type CalEvent = EventDraft;

export type CalendarActions = {
  addEvent: (input: EventInput) => Promise<{ id: string; posted: AnnounceResult }>;
  updateEvent: (eventId: string, input: EventInput) => Promise<{ posted: AnnounceResult }>;
  deleteEvent: (eventId: string) => Promise<void>;
};

// Our own month calendar. Week starts SATURDAY to match the BD Sat–Fri routine.
// It renders only the month it's given (the page reloads with ?m= on nav, so the
// ±12-month clamp lives server-side as prevMonth/nextMonth being null).
const COLS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
// JS getUTCDay(): Sun=0 … Sat=6. Our columns start on Sat, so shift by +1 mod 7.
const colOf = (dow: number) => (dow + 1) % 7;

type Filter = "ALL" | CategoryGroup;

export default function CalendarView({
  year,
  month,
  monthLabel,
  todayYMD,
  events,
  courses,
  hour12,
  prevMonth,
  nextMonth,
  actions,
}: {
  year: number;
  month: number; // 1–12
  monthLabel: string;
  todayYMD: string;
  events: CalEvent[];
  courses: CourseLite[];
  hour12: boolean;
  prevMonth: string | null; // "YYYY-MM" or null at the clamp edge
  nextMonth: string | null;
  actions: CalendarActions;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState<{ ymd: string; anchor: DOMRect } | null>(null);

  const visible = events.filter((e) => filter === "ALL" || categoryMeta(e.category).group === filter);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of visible) {
    const arr = byDay.get(e.date);
    if (arr) arr.push(e);
    else byDay.set(e.date, [e]);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  // Build the day grid (leading/trailing blanks padded to whole weeks).
  const firstCol = colOf(new Date(Date.UTC(year, month - 1, 1)).getUTCDay());
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const ymdOf = (d: number) => `${year}-${pad2(month)}-${pad2(d)}`;

  return (
    <div>
      {/* month nav */}
      <div className="mb-3 flex items-center justify-between">
        <NavArrow to={prevMonth} dir="prev" />
        <h2 className="font-display text-xl font-bold text-ink">{monthLabel}</h2>
        <NavArrow to={nextMonth} dir="next" />
      </div>

      {/* group filter */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["ALL", "STUDY", "NON_STUDY"] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
                (active ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-ink-soft hover:text-ink")
              }
            >
              {f === "ALL" ? "All" : GROUP_LABELS[f]}
            </button>
          );
        })}
      </div>

      {/* grid */}
      <div className="panel mat p-2 sm:p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {COLS.map((c) => (
            <div key={c} className="py-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-faint sm:text-[11px]">
              {c}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={`b${i}`} className="min-h-[4.25rem] rounded-lg bg-surface-2/40 sm:min-h-[5.5rem]" />;
            const ymd = ymdOf(d);
            const dayEvents = byDay.get(ymd) ?? [];
            const isToday = ymd === todayYMD;
            const isPast = ymd < todayYMD;
            return (
              <button
                key={ymd}
                onClick={(e) => setOpen({ ymd, anchor: e.currentTarget.getBoundingClientRect() })}
                className={
                  "flex min-h-[4.25rem] flex-col rounded-lg border bg-surface p-1 text-left transition-colors hover:border-brand sm:min-h-[5.5rem] sm:p-1.5 " +
                  (isToday ? "border-brand ring-1 ring-brand" : "border-line") +
                  (isPast ? " opacity-70" : "")
                }
              >
                <span
                  className={
                    "font-mono text-[11px] tabular-nums " +
                    (isToday ? "font-bold text-brand" : "text-ink-soft")
                  }
                >
                  {d}
                </span>
                {/* desktop: text chips */}
                <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className="truncate rounded px-1 text-[10px] font-semibold text-white"
                      style={{ background: categoryMeta(ev.category).color }}
                      title={ev.title}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[10px] font-medium text-ink-faint">+{dayEvents.length - 3} more</span>
                  )}
                </span>
                {/* mobile: colored dots */}
                {dayEvents.length > 0 && (
                  <span className="mt-auto flex flex-wrap gap-0.5 pt-1 sm:hidden">
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span key={ev.id} className="h-1.5 w-1.5 rounded-full" style={{ background: categoryMeta(ev.category).color }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <DayPanel
          key={open.ymd}
          ymd={open.ymd}
          anchor={open.anchor}
          allDayEvents={events.filter((e) => e.date === open.ymd)}
          courses={courses}
          hour12={hour12}
          actions={actions}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function NavArrow({ to, dir }: { to: string | null; dir: "prev" | "next" }) {
  const label = dir === "prev" ? "‹" : "›";
  const base = "flex h-9 w-9 items-center justify-center rounded-full border text-lg transition-colors";
  if (!to)
    return <span className={`${base} cursor-not-allowed border-line/60 text-ink-faint/50`} aria-hidden>{label}</span>;
  return (
    <Link
      href={`?m=${to}`}
      scroll={false}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className={`${base} border-line bg-surface text-ink-soft hover:border-brand hover:text-brand`}
    >
      {label}
    </Link>
  );
}

function DayPanel({
  ymd,
  anchor,
  allDayEvents,
  courses,
  hour12,
  actions,
  onClose,
}: {
  ymd: string;
  anchor: DOMRect;
  allDayEvents: CalEvent[]; // every event on this day, ignoring the group filter
  courses: CourseLite[];
  hour12: boolean;
  actions: CalendarActions;
  onClose: () => void;
}) {
  const [view, setView] = useState<"list" | "new" | { edit: CalEvent }>("list");
  const [note, setNote] = useState<AnnounceResult | null>(null);
  const [deleting, startDelete] = useTransition();

  const label = new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Popover anchor={anchor} onClose={onClose} width={320} padding="p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-display text-sm font-bold text-ink">{label}</div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">✕</button>
      </div>

      {view === "list" && (
        <div className="flex flex-col gap-2">
          {note && <PostedNote result={note} />}
          {allDayEvents.length === 0 ? (
            <p className="py-2 text-center text-xs text-ink-soft">No events yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {allDayEvents
                .slice()
                .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
                .map((ev) => {
                  const meta = categoryMeta(ev.category);
                  return (
                    <li key={ev.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{ev.title}</div>
                        <div className="truncate font-mono text-[10px] text-ink-faint">
                          {meta.label}
                          {ev.startTime ? ` · ${formatTime(ev.startTime, hour12)}${ev.endTime ? `–${formatTime(ev.endTime, hour12)}` : ""}` : " · all-day"}
                        </div>
                      </div>
                      <button onClick={() => setView({ edit: ev })} className="rounded p-1 text-ink-faint hover:text-brand" aria-label="Edit" title="Edit">✎</button>
                      <button
                        onClick={() => startDelete(async () => { await actions.deleteEvent(ev.id); })}
                        disabled={deleting}
                        className="rounded p-1 text-ink-faint hover:text-berry disabled:opacity-50"
                        aria-label="Delete"
                        title="Delete"
                      >
                        🗑
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          <button onClick={() => { setNote(null); setView("new"); }} className="pressable pressable-ghost px-3 py-2 text-sm">
            + Add event
          </button>
        </div>
      )}

      {view === "new" && (
        <EventForm
          date={ymd}
          courses={courses}
          hour12={hour12}
          onSave={async (input) => {
            const r = await actions.addEvent(input);
            setNote(r.posted);
          }}
          onCancel={() => setView("list")}
        />
      )}

      {typeof view === "object" && (
        <EventForm
          initial={view.edit}
          date={ymd}
          courses={courses}
          hour12={hour12}
          onSave={async (input) => {
            const r = await actions.updateEvent(view.edit.id, input);
            setNote(r.posted);
          }}
          onCancel={() => setView("list")}
        />
      )}
    </Popover>
  );
}

function PostedNote({ result }: { result: AnnounceResult }) {
  const map = {
    sent: { cls: "border-mint/40 bg-mint-tint text-mint-deep", text: "Saved · posted to Discord ✓" },
    skipped: { cls: "border-gold/40 bg-gold/10 text-gold-deep", text: `Saved · not posted — ${result.reason ?? "no channel"}` },
    failed: { cls: "border-berry/40 bg-berry/10 text-berry", text: `Saved · post failed — ${result.reason ?? "error"}` },
  }[result.status];
  return <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${map.cls}`}>{map.text}</div>;
}
