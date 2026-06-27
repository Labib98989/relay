import type { ResolvedDay } from "@/lib/resolve";
import { formatTime } from "@/lib/time";

// Read-only "this is what posts tonight" card. Server-rendered from the resolver
// so the CR sees the permanent schedule + this-week overrides exactly as the bot
// will. Updates on the next render after any edit (server actions revalidate).
export default function TomorrowPreview({
  resolved,
  dateLabel,
  postTime,
  connected,
  hour12,
}: {
  resolved: ResolvedDay;
  dateLabel: string;
  postTime: string;
  connected: boolean;
  hour12: boolean;
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
          <Empty emoji="🗓️" line="No classes scheduled for tomorrow." sub="Add some in Edit schedule, or it'll post a free day." />
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
