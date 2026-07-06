"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import Popover from "@/components/ui/Popover";

// The per-space navigation. Rendered once by the space layout, it wraps every
// section (Dashboard / Weekly routine / Calendar / Settings) and lets the CR jump
// between their up-to-5 spaces via the switcher. Desktop: a sticky left rail.
// Mobile: a switcher row + a horizontal strip of nav pills under the header.
// Active state comes from usePathname (a Client hook — layouts can't read it).

type SpaceLite = { id: string; name: string };

const NAV: { seg: string; label: string; short: string; icon: ReactNode }[] = [
  { seg: "", label: "Dashboard", short: "Dashboard", icon: <HomeIcon /> },
  { seg: "routine", label: "Weekly routine", short: "Routine", icon: <GridIcon /> },
  { seg: "calendar", label: "Calendar & events", short: "Calendar", icon: <CalendarIcon /> },
  { seg: "chat", label: "Assistant", short: "Chat", icon: <ChatIcon /> },
  { seg: "settings", label: "Settings", short: "Settings", icon: <GearIcon /> },
];

export default function SpaceSidebar({
  spaceId,
  spaceName,
  spaces,
}: {
  spaceId: string;
  spaceName: string;
  spaces: SpaceLite[];
}) {
  const pathname = usePathname();
  const base = `/dashboard/${spaceId}`;

  const items = NAV.map((n) => {
    const href = n.seg ? `${base}/${n.seg}` : base;
    const active = n.seg ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
    return { ...n, href, active };
  });

  return (
    <>
      {/* desktop rail */}
      <aside className="hidden shrink-0 border-r border-line/70 px-3 py-7 md:sticky md:top-16 md:flex md:h-[calc(100vh-4rem)] md:w-60 md:flex-col">
        <SpaceSwitcher spaceId={spaceId} spaceName={spaceName} spaces={spaces} />
        <nav className="mt-4 flex flex-col gap-1">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors " +
                (it.active
                  ? "bg-brand-tint font-semibold text-brand"
                  : "font-medium text-ink-soft hover:bg-surface-2 hover:text-ink")
              }
            >
              <span className={it.active ? "text-brand" : "text-ink-faint"}>{it.icon}</span>
              <span className="truncate">{it.label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href="/dashboard"
          className="mt-auto rounded-lg px-3 py-2 font-mono text-xs text-ink-faint transition-colors hover:text-brand"
        >
          ← all spaces
        </Link>
      </aside>

      {/* mobile strip */}
      <div className="sticky top-16 z-30 border-b border-line/70 bg-paper/85 px-4 py-2.5 backdrop-blur-md md:hidden">
        <SpaceSwitcher spaceId={spaceId} spaceName={spaceName} spaces={spaces} />
        <nav className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                (it.active
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line bg-surface text-ink-soft")
              }
            >
              {it.short}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

function SpaceSwitcher({ spaceId, spaceName, spaces }: { spaceId: string; spaceName: string; spaces: SpaceLite[] }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-ink-faint">Space</span>
          <span className="block truncate font-display text-sm font-bold text-ink">{spaceName}</span>
        </span>
        <ChevronIcon />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={244} padding="p-2">
          <div className="mb-1 px-1 font-mono text-[11px] font-semibold text-ink-faint">Your spaces</div>
          {spaces.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/${s.id}`}
              onClick={() => setAnchor(null)}
              className={
                "block truncate rounded-lg px-2 py-2 text-sm transition-colors " +
                (s.id === spaceId ? "bg-brand-tint font-semibold text-brand" : "text-ink hover:bg-surface-2")
              }
            >
              {s.name}
            </Link>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href="/dashboard"
              onClick={() => setAnchor(null)}
              className="block rounded-lg px-2 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-2"
            >
              + Manage spaces
            </Link>
          </div>
        </Popover>
      )}
    </>
  );
}

/* --------------------------------- icons ---------------------------------- */
// Small line icons (18px, currentColor) so they inherit the active/idle colour.

function iconProps() {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function HomeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5c-1.2 0-2.3-.25-3.3-.7L4 20l1.7-4.2a7.5 7.5 0 1 1 15.3-4.3Z" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.5M12 19v2.5M4.5 4.5l1.8 1.8M17.7 17.7l1.8 1.8M2.5 12H5M19 12h2.5M4.5 19.5l1.8-1.8M17.7 6.3l1.8-1.8" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg {...iconProps()} className="shrink-0 text-ink-faint">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
