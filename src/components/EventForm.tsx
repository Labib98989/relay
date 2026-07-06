"use client";

import { useState, useTransition } from "react";
import { TimeField } from "@/components/ui/TimePicker";
import { categoriesByGroup, categoryMeta } from "@/lib/categories";
import type { EventCategory } from "@/generated/prisma/enums";
import type { EventInput } from "@/app/dashboard/[spaceId]/actions";

export type CourseLite = { id: string; name: string };

// The fields of an existing event, for editing. New events start from defaults.
export type EventDraft = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  category: EventCategory;
  startTime: string | null;
  endTime: string | null;
  courseId: string | null;
  note: string | null;
};

// Add/edit form for a calendar event. Controlled locally; on submit it hands a
// clean EventInput to `onSave` (the parent runs the Server Action + captures the
// Discord post result) and, on success, calls `onCancel` to return to the list.
export default function EventForm({
  initial,
  date,
  courses,
  hour12,
  onSave,
  onCancel,
}: {
  initial?: EventDraft;
  date: string;
  courses: CourseLite[];
  hour12: boolean;
  onSave: (input: EventInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? "EXAM");
  const [day, setDay] = useState(initial?.date ?? date);
  const [timed, setTimed] = useState(!!initial?.startTime);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "10:00");
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!title.trim()) {
      setError("Give it a title");
      return;
    }
    setError(null);
    start(async () => {
      try {
        await onSave({
          title: title.trim(),
          date: day,
          category,
          startTime: timed ? startTime : null,
          endTime: timed ? endTime : null,
          courseId: courseId || null,
          note: note.trim() || null,
        });
        onCancel(); // parent returns to the list; revalidation refreshes it
      } catch {
        setError("Couldn't save — try again");
      }
    });
  }

  const field =
    "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none transition-colors focus:border-brand";

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <Label>Title</Label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Physics mid-term"
          className={`mt-1 ${field}`}
        />
      </div>

      <div>
        <Label>Category</Label>
        <div className="mt-1 flex flex-col gap-2">
          {categoriesByGroup().map((g) => (
            <div key={g.group}>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.categories.map((c) => {
                  const meta = categoryMeta(c);
                  const sel = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={
                        "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors " +
                        (sel ? "border-transparent text-white" : "border-line bg-surface text-ink-soft hover:border-brand")
                      }
                      style={sel ? { background: meta.color } : undefined}
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Date</Label>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`mt-1 ${field} font-mono`} />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setTimed((v) => !v)}
          className="flex items-center gap-2"
          aria-pressed={timed}
        >
          <span className={"relative h-5 w-9 rounded-full transition-colors " + (timed ? "bg-mint" : "bg-line-strong")}>
            <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all " + (timed ? "left-[1.125rem]" : "left-0.5")} />
          </span>
          <span className="text-sm font-medium text-ink">{timed ? "Has a time" : "All-day"}</span>
        </button>
        {timed && (
          <div className="mt-2 flex items-center gap-2">
            <TimeField
              value={startTime}
              hour12={hour12}
              onChange={setStartTime}
              ariaLabel="Start time"
              className="inline-flex min-w-[6rem] items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-sm text-ink transition-colors hover:border-brand"
            />
            <span className="text-ink-faint">–</span>
            <TimeField
              value={endTime}
              hour12={hour12}
              onChange={setEndTime}
              ariaLabel="End time"
              className="inline-flex min-w-[6rem] items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-sm text-ink transition-colors hover:border-brand"
            />
          </div>
        )}
      </div>

      {courses.length > 0 && (
        <div>
          <Label>Course (optional)</Label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={`mt-1 ${field}`}>
            <option value="">— none —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label>Note (optional)</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Syllabus, room, details…"
          className={`mt-1 ${field} resize-none`}
        />
      </div>

      {error && <p className="text-xs font-medium text-berry">{error}</p>}

      <div className="mt-1 flex items-center justify-between">
        <button onClick={submit} disabled={pending} className="pressable px-4 py-2 text-sm disabled:opacity-60">
          {pending ? "Saving…" : initial ? "Save changes" : "Add event"}
        </button>
        <button onClick={onCancel} className="font-mono text-xs text-ink-faint hover:text-ink">
          cancel
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block font-mono text-[11px] uppercase tracking-wider text-ink-faint">{children}</label>;
}
