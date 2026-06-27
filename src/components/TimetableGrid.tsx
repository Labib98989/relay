// Presentational, read-only timetable. Takes data as props and knows nothing
// about where it comes from. Skinned in the "Tactile Playbook" language — tiles
// on a dotted mat — and kept prop-compatible so it's a drop-in anywhere.

export type SlotStatus = "normal" | "cancelled" | "changed";

export type TimetableCourse = {
  name: string;
  color: string; // hex, drives the tile color
  room?: string;
};

export type TimetableSlot = {
  id: string;
  day: string; // must match one of `days`
  time: string; // must match one of `times` (the row it starts in)
  course: TimetableCourse;
  status?: SlotStatus;
  note?: string; // e.g. "Room → 502" for a changed slot
};

type Props = {
  days: string[];
  times: string[];
  slots: TimetableSlot[];
  onPick?: (day: string, time: string) => void;
};

function Chip({ slot }: { slot: TimetableSlot }) {
  const status = slot.status ?? "normal";
  const cancelled = status === "cancelled";
  return (
    <div
      className={"tile w-full px-3 py-2 " + (cancelled ? "opacity-50 saturate-50" : "")}
      style={{ background: slot.course.color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={"truncate text-sm font-bold " + (cancelled ? "line-through" : "")}>
          {slot.course.name}
        </span>
        {status === "changed" && (
          <span className="shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
            changed
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-xs text-white/85">
        {slot.note ?? slot.course.room ?? ""}
      </div>
    </div>
  );
}

function EmptyCell({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add class"
      className="slot-empty flex h-full min-h-[3.5rem] w-full items-center justify-center active:scale-[0.97]"
    >
      <span className="text-lg leading-none">+</span>
    </button>
  );
}

export default function TimetableGrid({ days, times, slots, onPick }: Props) {
  const at = (day: string, time: string) =>
    slots.find((s) => s.day === day && s.time === time);

  return (
    <>
      {/* Desktop: days as columns, time bands as rows */}
      <div className="mat hidden rounded-2xl p-3 md:block">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `4rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {days.map((day) => (
            <div
              key={day}
              className="pb-1 text-center font-mono text-xs font-semibold uppercase tracking-wider text-ink-soft"
            >
              {day}
            </div>
          ))}

          {times.map((time) => (
            <div key={time} className="contents">
              <div className="flex items-start justify-end pr-2 pt-2 font-mono text-xs tabular-nums text-ink-faint">
                {time}
              </div>
              {days.map((day) => {
                const slot = at(day, time);
                return (
                  <div key={day + time}>
                    {slot ? (
                      <Chip slot={slot} />
                    ) : (
                      <EmptyCell onClick={() => onPick?.(day, time)} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: one day after another, only the slots that exist */}
      <div className="flex flex-col gap-5 md:hidden">
        {days.map((day) => {
          const dayslots = slots
            .filter((s) => s.day === day)
            .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div key={day}>
              <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {day}
              </div>
              {dayslots.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onPick?.(day, times[0])}
                  className="slot-empty w-full py-3 text-sm"
                >
                  No classes — tap to add
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayslots.map((slot) => (
                    <div key={slot.id} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-faint">
                        {slot.time}
                      </span>
                      <div className="flex-1">
                        <Chip slot={slot} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
