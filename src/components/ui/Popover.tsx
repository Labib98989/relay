"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A floating panel rendered through a PORTAL to <body>, so it can never be
// clipped by an ancestor's overflow (e.g. the grid's horizontal-scroll box,
// where `overflow-x:auto` also clips vertically and would cut a menu off).
//   • Phones (<640): a docked bottom sheet with a tap-to-close backdrop.
//   • Desktop: a popover positioned from a trigger's rect — centred on it,
//     clamped to the viewport, flipped above if there's no room below. So it's
//     always aligned to the thing you tapped, never off-screen.
export default function Popover({
  anchor, onClose, width = 192, padding = "p-2", children,
}: {
  anchor: DOMRect | null;
  onClose: () => void;
  width?: number;
  padding?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Esc closes everywhere; on desktop, scrolling/resizing dismisses the popover
  // (it's anchored to a now-moved trigger). On mobile the sheet is fixed, so we
  // don't close on scroll — that would fire when scrolling inside the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (isMobile) return;
    // A scroll inside the popover (e.g. the time wheels) must NOT dismiss it;
    // only scrolling the page/grid behind it should.
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isMobile, onClose]);

  // Re-runs on `mounted` too: the first pass (before the portal mounts) measures
  // height 0, so the "flip above" branch can't fire — a tall popover (the time
  // wheels) would then overflow the bottom of the screen. Once mounted we have a
  // real offsetHeight and can place/flip correctly, before the browser paints.
  useLayoutEffect(() => {
    if (isMobile || !anchor) { setPos(null); return; }
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = ref.current?.offsetHeight ?? 0;
    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(pad, Math.min(left, vw - width - pad));
    let top = anchor.bottom + 6;
    if (h && top + h > vh - pad) {
      const above = anchor.top - 6 - h;
      top = above > pad ? above : Math.max(pad, vh - h - pad);
    }
    setPos({ left, top });
  }, [isMobile, anchor, width, mounted]);

  if (!mounted) return null;

  if (isMobile) {
    return createPortal(
      <>
        <div className="sheet-backdrop" onClick={onClose} />
        <div ref={ref} className={`panel sheet ${padding}`}>{children}</div>
      </>,
      document.body,
    );
  }
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className={`panel animate-pop-in fixed z-50 ${padding}`}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width, visibility: pos ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
