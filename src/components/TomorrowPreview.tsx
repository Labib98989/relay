import type { ResolvedDay } from "@/lib/resolve";
import { formatTime } from "@/lib/time";
import { categoryMeta } from "@/lib/categories";
import type { EventCategory } from "@/generated/prisma/enums";

export type PreviewEvent = {
  title: string;
  category: EventCategory;
  startTime: string | null;
  endTime: string | null;
};

// Read-only "this is what posts tonight" card. Server-rendered from the resolver
// so the CR sees the permanent schedule + this-week overrides exactly as the bot
// will. Updates on the next render after any edit (server actions revalidate).
export default function TomorrowPreview({
  resolved,
  dateLabel,
  postTime,
  connected,
  hour12,
  events = [],
}: {
  resolved: ResolvedDay;
  dateLabel: string;
  postTime: string;
  connected: boolean;
  hour12: boolean;
  events?: PreviewEvent[];
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            tonight&apos;s post · {formatTime(postTime, hour12)}
          </div>
          <h2 className="font-display text-lg font-bold text-ink">Tomorrow — {dateLabel}</h2>
        </div>
        {connected ? (
          <span className="rounded-full bg-mint-tint px-2.5 py-1 font-mono text-[11px] font-semibold text-mint-deep">
            ● channel ready
          </span>
        ) : (
          <span className="rounded-full bg-gold/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-gold-deep">
            ○ no channel
          </span>
        )}
      </div>

      <div className="p-5">
        {resolved.dayOff ? (
          <Empty emoji="🌙" line="Day off — no classes tomorrow." sub="Relay will post a rest-day note." />
        ) : resolved.items.length === 0 ? (
          <Empty emoji="🗓️" line="No classes scheduled for tomorrow." sub="Add some in Weekly routine, or it'll post a free day." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {resolved.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-20 shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-ink-faint">
                  {formatTime(it.startTime, hour12)}
                </span>
                <div className="tile flex flex-1 items-center justify-between px-3 py-2" style={{ background: it.color }}>
                  <span className="truncate text-sm font-bold">{it.name}</span>
                  <span className="flex items-center gap-2">
                    {it.room && <span className="text-xs text-white/85">{it.room}</span>}
                    {it.status !== "normal" && (
                      <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
                        {it.status === "extra" ? "one-off" : "changed"}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {events.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-faint">📌 Events tomorrow</div>
            <ul className="flex flex-col gap-1.5">
              {events.map((e, i) => {
                const meta = categoryMeta(e.category);
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{e.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                      {e.startTime ? formatTime(e.startTime, hour12) : meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Empty({ emoji, line, sub }: { emoji: string; line: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-center">
      <span className="text-2xl">{emoji}</span>
      <p className="font-semibold text-ink">{line}</p>
      <p className="text-sm text-ink-soft">{sub}</p>
    </div>
  );
}
