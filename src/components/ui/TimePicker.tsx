"use client";

import { useEffect, useRef, useState } from "react";
import Popover from "./Popover";
import { formatTime, pad2, parseHM, toHM } from "@/lib/time";

// A tap-to-open time control used everywhere a time is *edited* — the routine
// grid and the Settings "post time". Shows the value in the space's chosen
// format (12h/24h) and edits it in a stylish wheel dropdown. It always
// reads/writes canonical "HH:MM" 24h, so storage is identical either way, and
// it can't accept free-text garbage the way a bare <input> could.
export function TimeField({
  value, hour12, onChange, onCommit, className, ariaLabel,
}: {
  value: string;
  hour12: boolean;
  onChange: (v: string) => void;
  onCommit?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); setOpen(true); }}
        className={className}
      >
        {formatTime(value, hour12)}
      </button>
      {open && (
        <TimePicker
          value={value}
          hour12={hour12}
          anchor={anchor}
          onChange={onChange}
          onClose={() => { setOpen(false); onCommit?.(); }}
        />
      )}
    </>
  );
}

function TimePicker({
  value, hour12, anchor, onChange, onClose,
}: {
  value: string;
  hour12: boolean;
  anchor: DOMRect | null;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { h, m } = parseHM(value);
  const ap: "AM" | "PM" = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;

  const hours = hour12 ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i);
  const baseMins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  // keep an "odd" current minute (e.g. an imported :33) selectable
  const mins = baseMins.includes(m) ? baseMins : [...baseMins, m].sort((a, b) => a - b);

  const pickHour = (val: number) => onChange(toHM(hour12 ? (val % 12) + (ap === "PM" ? 12 : 0) : val, m));
  const pickMin = (val: number) => onChange(toHM(h, val));
  const pickAp = (val: "AM" | "PM") => onChange(toHM((h % 12) + (val === "PM" ? 12 : 0), m));

  return (
    <Popover anchor={anchor} onClose={onClose} width={hour12 ? 236 : 172} padding="p-2.5">
      <div className="mb-2 text-center font-display text-base font-bold text-ink">{formatTime(value, hour12)}</div>
      <div className="flex gap-1.5">
        <WheelColumn label="Hr" items={hours} selected={hour12 ? h12 : h} render={(x) => (hour12 ? String(x) : pad2(x))} onPick={pickHour} />
        <WheelColumn label="Min" items={mins} selected={m} render={pad2} onPick={pickMin} />
        {hour12 && <WheelColumn label="" items={["AM", "PM"] as const} selected={ap} render={(x) => x} onPick={pickAp} />}
      </div>
      <button onClick={onClose} className="pressable mt-2.5 w-full py-2 text-xs">Done</button>
    </Popover>
  );
}

// One scrollable wheel of values; the current one is highlighted and auto-
// centred when the picker opens.
function WheelColumn<T extends string | number>({
  label, items, selected, render, onPick,
}: {
  label: string;
  items: readonly T[];
  selected: T;
  render: (x: T) => string;
  onPick: (x: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = ref.current;
    const sel = c?.querySelector<HTMLElement>('[data-sel="true"]');
    if (c && sel) c.scrollTop = sel.offsetTop - c.clientHeight / 2 + sel.clientHeight / 2;
  }, []);
  return (
    <div className="flex-1">
      {label && <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>}
      <div ref={ref} className="h-40 overflow-y-auto rounded-xl border border-line bg-surface-2/60 p-1" style={{ scrollbarWidth: "thin" }}>
        {items.map((it) => {
          const sel = it === selected;
          return (
            <button
              key={String(it)}
              type="button"
              data-sel={sel}
              onClick={() => onPick(it)}
              className={"block w-full rounded-lg px-2 py-1.5 text-center font-mono text-sm tabular-nums transition-colors " + (sel ? "bg-brand font-bold text-on-brand" : "text-ink-soft hover:bg-surface hover:text-ink")}
            >
              {render(it)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
