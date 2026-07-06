"use client";

// The schedule editor — the heart of the app. Two layers in one surface:
//   • "Edit schedule" → the PERMANENT weekly grid  (Course + ScheduleSlot)
//   • "This week"     → TEMPORARY exceptions (Override): cancel, room change,
//                       one-off EXTRA class, or a whole DAY_OFF.
//
// Dual-mode: given `actions` + `data` it persists every change through Server
// Actions (optimistic — local state updates instantly, the save runs in a
// transition). Without them it's a local-only sandbox (the /design demo).
//
// Breaks and weekend toggles are intentionally cosmetic — the schema models the
// result (slots/overrides), not the editing scaffold — so they aren't persisted.

import { useMemo, useRef, useState, useTransition } from "react";
import type { Weekday } from "@/generated/prisma/enums";
import { formatTime } from "@/lib/time";
import type { Layout } from "@/lib/layout";
import Popover from "@/components/ui/Popover";
import { TimeField } from "@/components/ui/TimePicker";

// ----------------------------- types & shapes ------------------------------

type Course = { id: string; name: string; room: string; color: string };
type RowKind = "class" | "break";
type Row = { id: string; kind: RowKind; start: string; end: string; label?: string };
type Day = { key: Weekday; label: string; weekend: boolean };
type Placement = { rowId: string; dayKey: Weekday; courseId: string; slotId?: string };
// A "room" override is any CHANGED exception this week: a new room, and/or a
// one-off time move (startTime/endTime set, e.g. by the AI chat tools). The
// grid keeps the tile in its permanent row and badges the move instead.
type Override =
  | { rowId: string; dayKey: Weekday; kind: "cancel" }
  | { rowId: string; dayKey: Weekday; kind: "room"; room: string; startTime?: string; endTime?: string };
type Extra = { rowId: string; dayKey: Weekday; courseId: string; room?: string };

// What a drag is carrying: a fresh course from the palette, or a placed tile
// being relocated to another cell.
type DragPayload =
  | { kind: "palette"; courseId: string }
  | { kind: "move"; rowId: string; dayKey: Weekday; courseId: string };

// What the server sends down (and the editor reconstructs the grid from).
type OverridePayload =
  | { kind: "cancel"; slotId: string }
  | { kind: "room"; slotId: string; room?: string; startTime?: string; endTime?: string }
  | { kind: "extra"; courseId: string; weekday: Weekday; startTime: string; endTime: string; room?: string }
  | { kind: "dayoff"; weekday: Weekday };

export type EditorData = {
  // The saved editing scaffold (time rows + weekend layout). Null for legacy
  // spaces created before the layout column — the editor derives it from slots.
  layout: Layout | null;
  courses: { id: string; name: string; room: string; color: string }[];
  slots: { id: string; courseId: string; weekday: Weekday; startTime: string; endTime: string }[];
  overrides: OverridePayload[];
};

export type EditorActions = {
  addCourse: (name: string, color: string, room: string) => Promise<{ id: string }>;
  updateCourse: (courseId: string, data: { name?: string; room?: string; color?: string }) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  placeSlot: (courseId: string, weekday: Weekday, startTime: string, endTime: string) => Promise<{ id: string }>;
  removeSlot: (slotId: string) => Promise<void>;
  setSlotTimes: (slotIds: string[], startTime: string, endTime: string) => Promise<void>;
  cancelThisWeek: (slotId: string) => Promise<void>;
  changeRoomThisWeek: (slotId: string, room: string) => Promise<void>;
  // @relay-test-button — wired only for the week-mode test menu item; the AI
  // tools are the real consumers of this action.
  changeTimeThisWeek: (slotId: string, startTime: string, endTime: string, room?: string) => Promise<void>;
  clearThisWeek: (slotId: string) => Promise<void>;
  addExtraThisWeek: (courseId: string, weekday: Weekday, startTime: string, endTime: string, room: string) => Promise<{ id: string }>;
  clearExtraThisWeek: (weekday: Weekday, startTime: string) => Promise<void>;
  setDayOff: (weekday: Weekday) => Promise<void>;
  clearDayOff: (weekday: Weekday) => Promise<void>;
  // Persist the editor scaffold (time rows + weekend) whenever it changes.
  updateLayout: (layout: Layout) => Promise<void>;
};

const COLORS = [
  "#f4632e", "#2f93e6", "#15b886", "#e8467c",
  "#f3b324", "#8b5cf6", "#ef4444", "#18b6c9",
];

// Bangladesh week: Sat/Fri are the weekend by default (cosmetic, not saved).
const DAYS: Day[] = [
  { key: "SATURDAY", label: "Sat", weekend: true },
  { key: "SUNDAY", label: "Sun", weekend: false },
  { key: "MONDAY", label: "Mon", weekend: false },
  { key: "TUESDAY", label: "Tue", weekend: false },
  { key: "WEDNESDAY", label: "Wed", weekend: false },
  { key: "THURSDAY", label: "Thu", weekend: false },
  { key: "FRIDAY", label: "Fri", weekend: true },
];

const DEFAULT_ROWS: Row[] = [
  { id: "r1", kind: "class", start: "08:00", end: "09:30" },
  { id: "r2", kind: "class", start: "09:40", end: "11:10" },
  { id: "r3", kind: "class", start: "11:40", end: "13:10" },
];

let idCounter = 100;
const nextId = (p: string) => `${p}${idCounter++}`;

// Display helpers (formatTime / parseHM / toHM / pad2) live in @/lib/time so the
// editor, the "Tomorrow" preview, and the Discord digest all format identically.

// ---------------------------- state construction ---------------------------

type Seed = {
  courses: Course[];
  rows: Row[];
  days: Day[];
  placements: Placement[];
  overrides: Override[];
  extras: Extra[];
  daysOff: Weekday[];
};

// Reconstruct the editable grid from persisted data. Rows come from the SAVED
// layout (so breaks, empty periods and ordering survive); any slot/extra whose
// time band isn't already a row is folded in, so placements never lose their
// home even on legacy spaces with no saved layout.
function buildFromData(data: EditorData): Seed {
  const key = (s: string, e: string) => `${s}__${e}`;
  const rowIdByBand = new Map<string, string>();

  // Start from the saved layout when present; otherwise derive bands from the
  // placed slots/extras (legacy spaces), falling back to the default grid.
  const rows: Row[] = [];
  if (data.layout?.rows.length) {
    for (const r of data.layout.rows) {
      rows.push({ id: r.id, kind: r.kind, start: r.start, end: r.end, label: r.label });
      // Only class rows host placements; a break sharing a band must never steal one.
      if (r.kind === "class") rowIdByBand.set(key(r.start, r.end), r.id);
    }
  } else {
    const bandSources = [
      ...data.slots.map((s) => ({ start: s.startTime, end: s.endTime })),
      ...data.overrides.flatMap((o) => (o.kind === "extra" ? [{ start: o.startTime, end: o.endTime }] : [])),
    ];
    const bands = [...new Map(bandSources.map((b) => [key(b.start, b.end), b])).values()].sort(
      (a, b) => a.start.localeCompare(b.start),
    );
    (bands.length ? bands : DEFAULT_ROWS).forEach((b, i) => {
      const id = `r${i}`;
      rows.push({ id, kind: "class", start: b.start, end: b.end });
      rowIdByBand.set(key(b.start, b.end), id);
    });
  }

  // Fold in any placed band the layout doesn't cover yet (drift / pre-layout slots).
  let extraRowN = 0;
  const ensureRow = (s: string, e: string) => {
    const existing = rowIdByBand.get(key(s, e));
    if (existing) return existing;
    const id = `rx${extraRowN++}`;
    rows.push({ id, kind: "class", start: s, end: e });
    rowIdByBand.set(key(s, e), id);
    return id;
  };
  for (const s of data.slots) ensureRow(s.startTime, s.endTime);
  for (const o of data.overrides) if (o.kind === "extra") ensureRow(o.startTime, o.endTime);

  const rowOf = (s: string, e: string) => rowIdByBand.get(key(s, e));
  const placements: Placement[] = data.slots.flatMap((s) => {
    const rowId = rowOf(s.startTime, s.endTime);
    return rowId ? [{ rowId, dayKey: s.weekday, courseId: s.courseId, slotId: s.id }] : [];
  });

  const slotById = new Map(data.slots.map((s) => [s.id, s]));
  const overrides: Override[] = [];
  const extras: Extra[] = [];
  const daysOff: Weekday[] = [];
  for (const o of data.overrides) {
    if (o.kind === "cancel" || o.kind === "room") {
      const s = slotById.get(o.slotId);
      const rowId = s && rowOf(s.startTime, s.endTime);
      if (s && rowId)
        overrides.push(
          o.kind === "cancel"
            ? { rowId, dayKey: s.weekday, kind: "cancel" }
            : { rowId, dayKey: s.weekday, kind: "room", room: o.room ?? "", startTime: o.startTime, endTime: o.endTime },
        );
    } else if (o.kind === "extra") {
      const rowId = rowOf(o.startTime, o.endTime);
      if (rowId) extras.push({ rowId, dayKey: o.weekday, courseId: o.courseId, room: o.room });
    } else {
      daysOff.push(o.weekday);
    }
  }

  // Weekend layout comes from the saved set; legacy spaces keep the Bn default.
  const weekend = data.layout?.weekend;
  const days: Day[] = DAYS.map((d) =>
    weekend ? { ...d, weekend: weekend.includes(d.key) } : d,
  );

  return { courses: data.courses, rows, days, placements, overrides, extras, daysOff };
}

function demoSeed(): Seed {
  return {
    courses: [
      { id: "c1", name: "CSE 2101", room: "Room 301", color: "#f4632e" },
      { id: "c2", name: "MATH 1101", room: "Room 214", color: "#2f93e6" },
    ],
    rows: [
      { id: "r1", kind: "class", start: "08:00", end: "09:30" },
      { id: "r2", kind: "class", start: "09:40", end: "11:10" },
      { id: "rb", kind: "break", start: "11:10", end: "11:40", label: "Break" },
      { id: "r3", kind: "class", start: "11:40", end: "13:10" },
    ],
    days: DAYS,
    placements: [
      { rowId: "r1", dayKey: "SUNDAY", courseId: "c1" },
      { rowId: "r3", dayKey: "TUESDAY", courseId: "c2" },
    ],
    overrides: [],
    extras: [],
    daysOff: [],
  };
}

// --------------------------------- component -------------------------------

export default function ScheduleEditor({
  spaceName,
  meta,
  hour12: hour12Prop = true,
  lockMode,
  data,
  actions,
}: {
  spaceName: string;
  meta?: string;
  hour12?: boolean;
  // When set, the editor is pinned to one layer and the mode toggle is hidden —
  // the sidebar sections split the two: Dashboard = "week", Weekly routine =
  // "permanent". Unset (the /design sandbox) keeps the in-editor toggle.
  lockMode?: "permanent" | "week";
  data?: EditorData;
  actions?: EditorActions;
}) {
  const seed = useMemo(() => (data ? buildFromData(data) : demoSeed()), [data]);

  // The dashboard drives the time format from saved Settings (the prop). The
  // sandbox (no actions, no Settings panel) gets its own local toggle instead.
  const sandbox = !actions;
  const [localHour12, setLocalHour12] = useState(hour12Prop);
  const hour12 = sandbox ? localHour12 : hour12Prop;

  const [mode, setMode] = useState<"edit" | "week">(lockMode === "week" ? "week" : "edit");
  const [courses, setCourses] = useState(seed.courses);
  const [rows, setRows] = useState(seed.rows);
  const [days, setDays] = useState(seed.days);
  const [placements, setPlacements] = useState(seed.placements);
  const [overrides, setOverrides] = useState<Override[]>(seed.overrides);
  const [extras, setExtras] = useState<Extra[]>(seed.extras);
  const [daysOff, setDaysOff] = useState<Weekday[]>(seed.daysOff);

  const [armed, setArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ rowId: string; dayKey: Weekday } | null>(null);
  const [picking, setPicking] = useState<{ rowId: string; dayKey: Weekday } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState(false);

  // Fires the one-shot "snap onto the grid" animation for the cell just filled.
  const [placedPing, setPlacedPing] = useState<string | null>(null);
  function ping(rowId: string, dayKey: Weekday) {
    const k = `${rowId}:${dayKey}`;
    setPlacedPing(k);
    setTimeout(() => setPlacedPing((cur) => (cur === k ? null : cur)), 400);
  }

  // The clicked cell's viewport rect — anchors the action popover on desktop.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Drag-and-drop: the live payload (in a ref so it survives re-renders without
  // re-firing handlers) plus the cell currently hovered, for the drop highlight.
  const dragData = useRef<DragPayload | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  function endDrag() {
    dragData.current = null;
    setDragOver(null);
  }

  const courseById = (id: string) => courses.find((c) => c.id === id);
  const placementAt = (rowId: string, dayKey: Weekday) =>
    placements.find((p) => p.rowId === rowId && p.dayKey === dayKey);
  const overrideAt = (rowId: string, dayKey: Weekday) =>
    overrides.find((o) => o.rowId === rowId && o.dayKey === dayKey);
  const extraAt = (rowId: string, dayKey: Weekday) =>
    extras.find((e) => e.rowId === rowId && e.dayKey === dayKey);
  const isDayOff = (dayKey: Weekday) => daysOff.includes(dayKey);

  function save(fn: () => Promise<void>) {
    if (!actions) return;
    setSaveError(false);
    startSave(async () => {
      try {
        await fn();
      } catch (e) {
        console.error(e);
        setSaveError(true);
      }
    });
  }

  // Persist the editing scaffold (time rows + which days are weekends). Called
  // with the NEXT state explicitly, since the setState that triggered it hasn't
  // committed yet. Breaks/empty rows/weekend changes flow only through here —
  // they aren't slots, so they'd otherwise vanish on reload.
  function persistLayout(nextRows: Row[], nextDays: Day[]) {
    if (!actions) return;
    save(() =>
      actions.updateLayout({
        rows: nextRows.map((r) => ({
          id: r.id,
          kind: r.kind,
          start: r.start,
          end: r.end,
          ...(r.label ? { label: r.label } : {}),
        })),
        weekend: nextDays.filter((d) => d.weekend).map((d) => d.key),
      }),
    );
  }

  function hint() {
    if (mode === "week")
      return "This-week mode — tap a class to cancel it or change its room, tap (or drag a course onto) an empty cell to add a one-off, or tap a day name to mark it off. Everything resets automatically.";
    if (courses.length === 0) return "Start here → add your courses in the palette above.";
    if (armed) {
      const c = courseById(armed);
      return `“${c?.name}” is in your hand — tap any empty cell to drop it. Tap it again to put it down.`;
    }
    if (selected) return "Choose an action for this class: Move, Remove, or change Room.";
    return "Tap a course to pick it up, then tap a cell to place it. Or drag a course straight onto the grid.";
  }

  // ----------------------- permanent-layer mutations ------------------------
  function place(rowId: string, dayKey: Weekday, courseId: string) {
    setPlacements((prev) => [
      ...prev.filter((p) => !(p.rowId === rowId && p.dayKey === dayKey)),
      { rowId, dayKey, courseId },
    ]);
    ping(rowId, dayKey);
    const row = rows.find((r) => r.id === rowId);
    if (actions && row) {
      save(async () => {
        const { id } = await actions.placeSlot(courseId, dayKey, row.start, row.end);
        setPlacements((prev) =>
          prev.map((p) => (p.rowId === rowId && p.dayKey === dayKey ? { ...p, slotId: id } : p)),
        );
      });
    }
  }

  function removePlacement(rowId: string, dayKey: Weekday) {
    const existing = placementAt(rowId, dayKey);
    setPlacements((prev) => prev.filter((p) => !(p.rowId === rowId && p.dayKey === dayKey)));
    if (actions && existing?.slotId) {
      const slotId = existing.slotId;
      save(() => actions.removeSlot(slotId));
    }
  }

  function deleteRow(rowId: string) {
    const slotIds = placements.filter((p) => p.rowId === rowId && p.slotId).map((p) => p.slotId!);
    const nextRows = rows.filter((r) => r.id !== rowId);
    setRows(nextRows);
    setPlacements((prev) => prev.filter((p) => p.rowId !== rowId));
    setExtras((prev) => prev.filter((e) => e.rowId !== rowId));
    if (actions && slotIds.length) {
      save(async () => {
        for (const id of slotIds) await actions.removeSlot(id);
      });
    }
    persistLayout(nextRows, days);
  }

  function commitRowTimes(rowId: string) {
    if (!actions) return;
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const slotIds = placements.filter((p) => p.rowId === rowId && p.slotId).map((p) => p.slotId!);
    if (slotIds.length) save(() => actions.setSlotTimes(slotIds, row.start, row.end));
    // Always persist the row's new band — even an empty row (no slots) must stick.
    persistLayout(rows, days);
  }

  function addCourse(name: string, room: string) {
    const color = COLORS[courses.length % COLORS.length];
    const tempId = nextId("c");
    setCourses((prev) => [...prev, { id: tempId, name, room, color }]);
    setAdding(false);
    if (actions) {
      save(async () => {
        const { id } = await actions.addCourse(name, color, room);
        setCourses((prev) => prev.map((c) => (c.id === tempId ? { ...c, id } : c)));
        setPlacements((prev) => prev.map((p) => (p.courseId === tempId ? { ...p, courseId: id } : p)));
      });
    }
  }

  function editCourse(courseId: string, name: string, room: string) {
    setCourses((prev) => prev.map((x) => (x.id === courseId ? { ...x, name, room } : x)));
    if (actions) save(() => actions.updateCourse(courseId, { name, room }));
  }

  function deleteCourse(courseId: string) {
    setCourses((prev) => prev.filter((x) => x.id !== courseId));
    setPlacements((prev) => prev.filter((p) => p.courseId !== courseId));
    setExtras((prev) => prev.filter((e) => e.courseId !== courseId));
    if (actions) save(() => actions.deleteCourse(courseId));
  }

  // ------------------------ this-week mutations -----------------------------
  function setRoom(row: Row, day: Day, course: Course, room: string) {
    if (mode === "edit") {
      setCourses((prev) => prev.map((x) => (x.id === course.id ? { ...x, room } : x)));
      if (actions) save(() => actions.updateCourse(course.id, { room }));
    } else {
      setOverrides((prev) => {
        // Keep an existing time move on this cell — a room edit stacks on it,
        // mirroring the server-side merge in replaceOverride.
        const prior = prev.find((o) => o.rowId === row.id && o.dayKey === day.key);
        const times = prior?.kind === "room" ? { startTime: prior.startTime, endTime: prior.endTime } : {};
        return [
          ...prev.filter((o) => !(o.rowId === row.id && o.dayKey === day.key)),
          { rowId: row.id, dayKey: day.key, kind: "room", room, ...times },
        ];
      });
      const slotId = placementAt(row.id, day.key)?.slotId;
      if (actions && slotId) save(() => actions.changeRoomThisWeek(slotId, room));
    }
    setSelected(null);
  }

  // @relay-test-button — temporary manual pipeline poke: moves this class's
  // upcoming occurrence to 15:00–16:00 via changeTimeThisWeek so the CHANGED-
  // with-time override, the "→ moved" badge, and the digest rendering can all
  // be verified by hand. Grep this tag to remove.
  function testMoveWeek(row: Row, day: Day) {
    setOverrides((prev) => {
      const prior = prev.find((o) => o.rowId === row.id && o.dayKey === day.key);
      const room = prior?.kind === "room" ? prior.room : "";
      return [
        ...prev.filter((o) => !(o.rowId === row.id && o.dayKey === day.key)),
        { rowId: row.id, dayKey: day.key, kind: "room", room, startTime: "15:00", endTime: "16:00" },
      ];
    });
    const slotId = placementAt(row.id, day.key)?.slotId;
    if (actions && slotId) save(() => actions.changeTimeThisWeek(slotId, "15:00", "16:00"));
    setSelected(null);
  }

  function cancelWeek(row: Row, day: Day) {
    setOverrides((prev) => [
      ...prev.filter((o) => !(o.rowId === row.id && o.dayKey === day.key)),
      { rowId: row.id, dayKey: day.key, kind: "cancel" },
    ]);
    const slotId = placementAt(row.id, day.key)?.slotId;
    if (actions && slotId) save(() => actions.cancelThisWeek(slotId));
    setSelected(null);
  }

  function addExtra(rowId: string, dayKey: Weekday, courseId: string) {
    const room = courseById(courseId)?.room ?? "";
    setExtras((prev) => [...prev.filter((e) => !(e.rowId === rowId && e.dayKey === dayKey)), { rowId, dayKey, courseId, room }]);
    setPicking(null);
    ping(rowId, dayKey);
    const row = rows.find((r) => r.id === rowId);
    if (actions && row) save(async () => { await actions.addExtraThisWeek(courseId, dayKey, row.start, row.end, room); });
  }

  function setExtraRoom(rowId: string, dayKey: Weekday, room: string) {
    const e = extraAt(rowId, dayKey);
    const row = rows.find((r) => r.id === rowId);
    setExtras((prev) => prev.map((x) => (x.rowId === rowId && x.dayKey === dayKey ? { ...x, room } : x)));
    setSelected(null);
    if (actions && row && e) save(async () => { await actions.addExtraThisWeek(e.courseId, dayKey, row.start, row.end, room); });
  }

  function removeExtra(rowId: string, dayKey: Weekday) {
    const row = rows.find((r) => r.id === rowId);
    setExtras((prev) => prev.filter((e) => !(e.rowId === rowId && e.dayKey === dayKey)));
    setSelected(null);
    if (actions && row) save(() => actions.clearExtraThisWeek(dayKey, row.start));
  }

  function toggleDayOff(dayKey: Weekday) {
    const off = isDayOff(dayKey);
    setDaysOff((prev) => (off ? prev.filter((k) => k !== dayKey) : [...prev, dayKey]));
    if (actions) save(() => (off ? actions.clearDayOff(dayKey) : actions.setDayOff(dayKey)));
  }

  // A tile was dropped on a cell. Palette tiles place a class (edit) or a one-off
  // (this week); a dragged placed tile moves to the new cell (edit only).
  function onCellDrop(row: Row, day: Day) {
    const d = dragData.current;
    endDrag();
    if (!d || row.kind === "break" || day.weekend) return;
    if (mode === "week" && isDayOff(day.key)) return;
    if (d.kind === "palette") {
      if (mode === "edit") place(row.id, day.key, d.courseId);
      else addExtra(row.id, day.key, d.courseId);
    } else {
      if (mode !== "edit") return;
      if (d.rowId === row.id && d.dayKey === day.key) return;
      removePlacement(d.rowId, d.dayKey);
      place(row.id, day.key, d.courseId);
    }
  }

  function onCellClick(row: Row, day: Day, rect?: DOMRect) {
    if (row.kind === "break" || day.weekend) return;
    if (mode === "week" && isDayOff(day.key)) return;
    const placement = placementAt(row.id, day.key);
    const extra = extraAt(row.id, day.key);
    if (rect) setAnchor(rect);
    if (mode === "week") {
      if (placement || extra) setSelected({ rowId: row.id, dayKey: day.key });
      else if (armed) addExtra(row.id, day.key, armed);
      else setPicking({ rowId: row.id, dayKey: day.key });
      return;
    }
    if (placement) setSelected({ rowId: row.id, dayKey: day.key });
    else if (armed) place(row.id, day.key, armed);
  }

  // Edit mode: a day header toggles whether that column is a weekend — and it
  // must work BOTH ways, so the button stays live even once it's switched off.
  // This-week mode: it marks the day off (weekend columns aren't eligible).
  function onDayHeaderClick(d: Day) {
    if (mode === "edit") {
      const nextDays = days.map((x) => (x.key === d.key ? { ...x, weekend: !x.weekend } : x));
      setDays(nextDays);
      persistLayout(rows, nextDays);
    } else if (!d.weekend) toggleDayOff(d.key);
  }

  // ----------------------------------- UI -----------------------------------
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-40 sm:px-6">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{spaceName}</h1>
            <SaveBadge persisted={!!actions} saving={isSaving} error={saveError} />
          </div>
          {meta && <p className="font-mono text-xs text-ink-soft">{meta}</p>}
        </div>

        <div className="flex items-center gap-2">
          {!lockMode && (
            <div className="flex rounded-2xl border border-line bg-surface-2 p-1 text-sm font-semibold">
              {(["edit", "week"] as const).map((m) => {
                const active = mode === m;
                const activeCls = m === "edit" ? "bg-brand text-on-brand" : "bg-mint text-on-brand";
                return (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setArmed(null); setSelected(null); setPicking(null); }}
                    title={m === "edit" ? "Edit the permanent schedule" : "Make temporary, this-week-only changes"}
                    className={"rounded-xl px-3.5 py-2 transition-all sm:py-1.5 " + (active ? `${activeCls} shadow-sm` : "text-ink-soft hover:text-ink")}
                  >
                    {m === "edit" ? "Edit schedule" : "This week"}
                  </button>
                );
              })}
            </div>
          )}
          {sandbox && (
            <div className="flex rounded-2xl border border-line bg-surface-2 p-1 font-mono text-xs font-semibold" title="Time display format (saved per space on the real dashboard)">
              {([[true, "12h"], [false, "24h"]] as const).map(([val, label]) => (
                <button
                  key={label}
                  onClick={() => setLocalHour12(val)}
                  className={"rounded-lg px-2.5 py-1.5 transition-colors " + (localHour12 === val ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setHelpOpen(true)}
            title="How does this work? (reopen anytime)"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            ?
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-3 rounded-xl border border-berry/40 bg-berry/10 px-3.5 py-2.5 text-sm text-berry">
          Couldn&apos;t save your last change. Check your connection — reloading will resync from the server.
        </div>
      )}

      <div className="hint mb-3 px-3.5 py-2.5 text-sm">
        <span className="hint-dot" aria-hidden />
        <span>{hint()}</span>
      </div>

      {mode === "week" && (
        <div className="animate-pop-in mb-3 rounded-xl border border-mint/40 bg-mint-tint px-3.5 py-2.5 text-sm text-mint-deep">
          ✦ These are <b>real</b> changes — but only for this week. They reset on their own.
        </div>
      )}

      {/* course palette — present in BOTH modes. In edit mode a tile becomes a
          permanent slot; in this-week mode it becomes a one-off. */}
      <div className="panel animate-rise mb-4 p-3.5">
        <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          {mode === "edit"
            ? "Courses — tap to pick up, drag onto the grid, ✎ to edit"
            : "Courses — drag onto an empty cell (or tap, then tap a cell) for a one-off"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {courses.map((c) => {
            const isArmed = armed === c.id;
            return (
              <div key={c.id} className="relative">
                <button
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "copy";
                    dragData.current = { kind: "palette", courseId: c.id };
                  }}
                  onDragEnd={endDrag}
                  onClick={() => setArmed(isArmed ? null : c.id)}
                  title={`${c.name} · ${c.room}`}
                  className={"tile flex cursor-grab items-center gap-2 px-3 py-2 text-sm font-bold active:cursor-grabbing " + (isArmed ? "tile-armed" : "")}
                  style={{ background: c.color, ["--ring" as string]: c.color }}
                >
                  {c.name}
                  <span
                    onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget.getBoundingClientRect()); setEditingCourse(c.id); }}
                    className="cursor-pointer rounded-full bg-white/25 px-1 text-xs"
                  >
                    ✎
                  </span>
                </button>
                {editingCourse === c.id && (
                  <CourseEditor
                    course={c}
                    anchor={anchor}
                    onSave={(name, room) => editCourse(c.id, name, room)}
                    onDelete={() => deleteCourse(c.id)}
                    onClose={() => setEditingCourse(null)}
                  />
                )}
              </div>
            );
          })}
          {adding ? (
            <CourseEditor onSave={(name, room) => addCourse(name, room)} onClose={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="rounded-xl border border-dashed border-brand/50 px-3 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-tint"
            >
              + Add course
            </button>
          )}
        </div>
      </div>

      {/* structure controls */}
      {mode === "edit" && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => {
              const next = [...rows, { id: nextId("r"), kind: "class" as const, start: "08:00", end: "09:00" }];
              setRows(next);
              persistLayout(next, days);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            + Add time row
          </button>
          <button
            onClick={() => {
              const next = [...rows, { id: nextId("r"), kind: "break" as const, start: "10:00", end: "10:15", label: "Break" }];
              setRows(next);
              persistLayout(next, days);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            + Add break
          </button>
          <span className="self-center font-mono text-[11px] text-ink-faint">
            tip: click a day name to toggle weekend · edit times in their boxes
          </span>
        </div>
      )}

      {/* the grid — lives on the dotted "mat" */}
      <div className="relative">
        <div className="panel mat overflow-x-auto p-3 sm:p-4">
          <div
            className="grid min-w-[648px] gap-1.5"
            style={{ gridTemplateColumns: `6rem repeat(${days.length}, minmax(0,1fr))` }}
          >
          <div />
          {days.map((d) => {
            const off = mode === "week" && !d.weekend && isDayOff(d.key);
            return (
              <button
                key={d.key}
                disabled={mode === "week" && d.weekend}
                onClick={() => onDayHeaderClick(d)}
                title={mode === "edit" ? (d.weekend ? "Weekend — click to switch this day back on" : "Click to make this day a weekend") : d.weekend ? undefined : "Mark this day off (this week)"}
                className={
                  "flex items-center justify-center gap-1 pb-1 text-center font-mono text-xs font-semibold uppercase tracking-wider transition-colors " +
                  (off ? "text-berry" : d.weekend ? "text-ink-faint line-through" : "text-ink-soft") +
                  (mode === "edit" || !d.weekend ? " hover:text-brand" : "")
                }
              >
                {d.label}
                {off && <span className="rounded-full bg-berry/15 px-1 text-[8px] lowercase">off</span>}
              </button>
            );
          })}

          {rows.map((row) =>
            row.kind === "break" ? (
              <div key={row.id} className="contents">
                <TimeCell row={row} editable={mode === "edit"} hour12={hour12} onChange={setRows} onDelete={() => deleteRow(row.id)} onCommit={() => commitRowTimes(row.id)} />
                <div
                  style={{ gridColumn: `span ${days.length}` }}
                  className="flex items-center justify-center rounded-lg bg-surface-2 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-faint"
                >
                  {row.label ?? "Break"}
                </div>
              </div>
            ) : (
              <div key={row.id} className="contents">
                <TimeCell row={row} editable={mode === "edit"} hour12={hour12} onChange={setRows} onDelete={() => deleteRow(row.id)} onCommit={() => commitRowTimes(row.id)} />
                {days.map((day) => {
                  const placement = placementAt(row.id, day.key);
                  const course = placement ? courseById(placement.courseId) : undefined;
                  const ov = overrideAt(row.id, day.key);
                  const extra = !placement ? extraAt(row.id, day.key) : undefined;
                  const extraCourse = extra ? courseById(extra.courseId) : undefined;
                  const dayOff = mode === "week" && !day.weekend && isDayOff(day.key);
                  const isSel = selected?.rowId === row.id && selected?.dayKey === day.key;
                  const isPicking = picking?.rowId === row.id && picking?.dayKey === day.key;
                  const cellKey = `${row.id}:${day.key}`;
                  const droppable = !day.weekend && !dayOff;
                  return (
                    <div
                      key={day.key}
                      className={"relative rounded-lg " + (dragOver === cellKey ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2" : "")}
                      onDragOver={(e) => { if (droppable && dragData.current) { e.preventDefault(); if (dragOver !== cellKey) setDragOver(cellKey); } }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((cur) => (cur === cellKey ? null : cur)); }}
                      onDrop={() => onCellDrop(row, day)}
                    >
                      <GridCell
                        weekend={day.weekend}
                        dayOff={dayOff}
                        hour12={hour12}
                        course={course}
                        override={ov}
                        extraCourse={extraCourse}
                        extraRoom={extra?.room}
                        drop={placedPing === cellKey}
                        draggableTile={mode === "edit" && !!placement}
                        onTileDragStart={() => { if (placement) dragData.current = { kind: "move", rowId: row.id, dayKey: day.key, courseId: placement.courseId }; }}
                        onTileDragEnd={endDrag}
                        onClick={(rect) => onCellClick(row, day, rect)}
                      />
                      {isSel && placement && course && (
                        <CellMenu
                          mode={mode}
                          course={course}
                          override={ov}
                          anchor={anchor}
                          onMove={() => { removePlacement(row.id, day.key); setArmed(placement.courseId); setSelected(null); }}
                          onRemove={() => { removePlacement(row.id, day.key); setSelected(null); }}
                          onRoom={(room) => setRoom(row, day, course, room)}
                          onCancel={() => cancelWeek(row, day)}
                          onTestMove={() => testMoveWeek(row, day)}
                          onClose={() => setSelected(null)}
                        />
                      )}
                      {isSel && !placement && extra && extraCourse && (
                        <ExtraMenu
                          course={extraCourse}
                          room={extra.room ?? extraCourse.room}
                          anchor={anchor}
                          onRoom={(room) => setExtraRoom(row.id, day.key, room)}
                          onRemove={() => removeExtra(row.id, day.key)}
                          onClose={() => setSelected(null)}
                        />
                      )}
                      {isPicking && (
                        <ExtraPicker
                          courses={courses}
                          anchor={anchor}
                          onPick={(courseId) => addExtra(row.id, day.key, courseId)}
                          onClose={() => setPicking(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
          </div>
        </div>
        {/* mobile scroll affordance: the rest of the week lies to the right */}
        <div className="pointer-events-none absolute inset-y-1 right-1 w-10 rounded-r-[1.2rem] bg-gradient-to-l from-surface-2 to-transparent sm:hidden" />
      </div>
      <p className="mt-2 text-center font-mono text-[11px] text-ink-faint sm:hidden">
        swipe across to see the whole week →
      </p>

      {helpOpen && <HelpDrawer onClose={() => setHelpOpen(false)} />}
    </main>
  );
}

// ------------------------------- sub-components -----------------------------

function SaveBadge({ persisted, saving, error }: { persisted: boolean; saving: boolean; error: boolean }) {
  const state = !persisted ? "sandbox" : error ? "error" : saving ? "saving" : "saved";
  const styles: Record<string, { cls: string; label: string; title?: string }> = {
    sandbox: { cls: "bg-gold/20 text-gold-deep", label: "sandbox", title: "Sandbox — changes are local and not saved." },
    error: { cls: "bg-berry/15 text-berry", label: "save failed" },
    saving: { cls: "bg-gold/20 text-gold-deep", label: "saving…" },
    saved: { cls: "bg-mint-tint text-mint-deep", label: "saved ✓" },
  };
  const { cls, label, title } = styles[state];
  // `key={state}` remounts on change so the new badge pops in.
  return (
    <span key={state} title={title} className={`animate-pop-in rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function TimeCell({
  row, editable, hour12, onChange, onDelete, onCommit,
}: {
  row: Row;
  editable: boolean;
  hour12: boolean;
  onChange: React.Dispatch<React.SetStateAction<Row[]>>;
  onDelete: () => void;
  onCommit: () => void;
}) {
  if (!editable)
    return (
      <div className="flex items-start justify-end pr-2 pt-1.5 font-mono text-[11px] tabular-nums text-ink-faint">
        {formatTime(row.start, hour12)}
      </div>
    );
  const set = (field: "start" | "end", v: string) =>
    onChange((p) => p.map((r) => (r.id === row.id ? { ...r, [field]: v } : r)));
  const cellField = (tone: "ink" | "soft") =>
    "w-full rounded-md border border-line bg-surface px-1.5 py-1 text-right font-mono text-[11px] tabular-nums transition-colors hover:border-brand sm:py-0.5 " +
    (tone === "soft" ? "text-ink-soft" : "text-ink");
  return (
    <div className="group flex flex-col items-stretch gap-1 pr-1 pt-1">
      <TimeField value={row.start} hour12={hour12} className={cellField("ink")} ariaLabel="Start time" onChange={(v) => set("start", v)} onCommit={onCommit} />
      <TimeField value={row.end} hour12={hour12} className={cellField("soft")} ariaLabel="End time" onChange={(v) => set("end", v)} onCommit={onCommit} />
      {/* always reachable on touch (no hover); fades in on hover for desktop */}
      <button onClick={onDelete} title="Delete row" aria-label="Delete time row" className="self-end font-mono text-xs leading-none text-ink-faint opacity-60 transition hover:text-berry sm:text-[10px] sm:opacity-0 sm:group-hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

function GridCell({
  weekend, dayOff, hour12, course, override, extraCourse, extraRoom, drop,
  draggableTile, onTileDragStart, onTileDragEnd, onClick,
}: {
  weekend: boolean;
  dayOff: boolean;
  hour12: boolean;
  course?: Course;
  override?: Override;
  extraCourse?: Course;
  extraRoom?: string;
  drop?: boolean;
  draggableTile?: boolean;
  onTileDragStart?: () => void;
  onTileDragEnd?: () => void;
  onClick: (rect: DOMRect) => void;
}) {
  if (weekend) return <div className="min-h-[3.25rem] rounded-lg bg-surface-2/50" />;

  const cancelled = override?.kind === "cancel";
  const roomChanged = override?.kind === "room";
  // A CHANGED override that moved the occurrence to a new time band this week.
  const movedTo =
    override?.kind === "room" && override.startTime && override.endTime
      ? `${formatTime(override.startTime, hour12)}–${formatTime(override.endTime, hour12)}`
      : null;
  const dragProps = draggableTile
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", ""); e.dataTransfer.effectAllowed = "move"; onTileDragStart?.(); },
        onDragEnd: onTileDragEnd,
      }
    : {};
  const grab = draggableTile ? "cursor-grab active:cursor-grabbing " : "";

  // permanent class
  if (course) {
    const dimmed = dayOff || cancelled;
    const badge = dayOff ? "day off" : cancelled ? "off" : movedTo ? `→ ${movedTo}` : roomChanged ? "changed" : null;
    return (
      // `key` flips with `drop` so a freshly placed tile remounts and plays the snap.
      <button key={drop ? "snap" : "rest"} {...dragProps} onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())} className={"tile min-h-[3.25rem] w-full px-2 py-1.5 text-left " + grab + (drop ? "animate-drop-in " : "") + (dimmed ? "opacity-50 saturate-50" : "")} style={{ background: course.color }}>
        <div className="flex items-center justify-between gap-1">
          <span className={"truncate text-xs font-bold " + (dimmed ? "line-through" : "")}>{course.name}</span>
          {badge && <span className="shrink-0 rounded-full bg-white/25 px-1 text-[9px] font-semibold">{badge}</span>}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-white/85">{roomChanged ? override.room || course.room : course.room}</div>
      </button>
    );
  }

  // one-off extra (this week)
  if (extraCourse) {
    return (
      <button key={drop ? "snap" : "rest"} onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())} className={"tile min-h-[3.25rem] w-full px-2 py-1.5 text-left " + (drop ? "animate-drop-in " : "") + (dayOff ? "opacity-50 saturate-50" : "")} style={{ background: extraCourse.color }}>
        <div className="flex items-center justify-between gap-1">
          <span className={"truncate text-xs font-bold " + (dayOff ? "line-through" : "")}>{extraCourse.name}</span>
          <span className="shrink-0 rounded-full bg-white/25 px-1 text-[9px] font-semibold">one-off</span>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-white/85">{extraRoom || extraCourse.room}</div>
      </button>
    );
  }

  // empty (drop handling lives on the wrapping cell)
  if (dayOff) return <div className="min-h-[3.25rem] rounded-lg border border-dashed border-line/50" />;
  return (
    <button
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      className="slot-empty flex min-h-[3.25rem] w-full items-center justify-center active:scale-[0.97]"
    >
      <span className="text-lg leading-none">+</span>
    </button>
  );
}

function CellMenu({
  mode, course, override, anchor, onMove, onRemove, onRoom, onCancel, onTestMove, onClose,
}: {
  mode: "edit" | "week";
  course: Course;
  override?: Override;
  anchor: DOMRect | null;
  onMove: () => void;
  onRemove: () => void;
  onRoom: (room: string) => void;
  onCancel: () => void;
  // @relay-test-button — temporary manual pipeline poke; grep tag to remove.
  onTestMove: () => void;
  onClose: () => void;
}) {
  const [room, setRoom] = useState(override?.kind === "room" ? override.room : course.room);
  return (
    <Popover anchor={anchor} onClose={onClose} width={208}>
      <div className="mb-1 px-1 font-mono text-[11px] font-semibold text-ink-faint">{course.name}</div>
      {mode === "edit" ? (
        <>
          <MenuItem onClick={onMove}>Move to another cell</MenuItem>
          <MenuItem onClick={onRemove} danger>Remove from schedule</MenuItem>
        </>
      ) : (
        <>
          <MenuItem onClick={onCancel} danger>Cancel this week</MenuItem>
          {/* @relay-test-button — temporary manual pipeline poke; grep tag to remove. */}
          <MenuItem onClick={onTestMove}>test: move to 15:00–16:00</MenuItem>
        </>
      )}
      <div className="mt-1 flex gap-1.5 border-t border-line pt-2">
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" className="w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-brand sm:py-1 sm:text-xs" />
        <button onClick={() => onRoom(room)} className="rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand sm:px-2 sm:text-xs">Set</button>
      </div>
      <button onClick={onClose} className="mt-1.5 w-full py-1 text-center font-mono text-[11px] text-ink-faint hover:text-ink">close</button>
    </Popover>
  );
}

function ExtraMenu({
  course, room, anchor, onRoom, onRemove, onClose,
}: {
  course: Course;
  room: string;
  anchor: DOMRect | null;
  onRoom: (room: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [r, setR] = useState(room);
  return (
    <Popover anchor={anchor} onClose={onClose} width={208}>
      <div className="mb-1 px-1 font-mono text-[11px] font-semibold text-ink-faint">{course.name} · one-off</div>
      <MenuItem onClick={onRemove} danger>Remove one-off</MenuItem>
      <div className="mt-1 flex gap-1.5 border-t border-line pt-2">
        <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Room" className="w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-mint sm:py-1 sm:text-xs" />
        <button onClick={() => onRoom(r)} className="rounded-lg bg-mint px-3 text-sm font-semibold text-on-brand sm:px-2 sm:text-xs">Set</button>
      </div>
      <button onClick={onClose} className="mt-1.5 w-full py-1 text-center font-mono text-[11px] text-ink-faint hover:text-ink">close</button>
    </Popover>
  );
}

function ExtraPicker({
  courses, anchor, onPick, onClose,
}: {
  courses: Course[];
  anchor: DOMRect | null;
  onPick: (courseId: string) => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={224} padding="p-2.5">
      <div className="mb-1.5 font-mono text-[11px] font-semibold text-ink-faint">Add a one-off class</div>
      {courses.length === 0 ? (
        <p className="text-xs text-ink-soft">No courses yet — add some in “Edit schedule” first.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => (
            <button key={c.id} onClick={() => onPick(c.id)} className="tile px-2.5 py-1.5 text-xs font-bold" style={{ background: c.color }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} className="mt-2 w-full py-1 text-center font-mono text-[11px] text-ink-faint hover:text-ink">close</button>
    </Popover>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={"block w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-2 sm:py-1.5 sm:text-xs " + (danger ? "text-berry" : "text-ink")}>
      {children}
    </button>
  );
}

function CourseEditor({
  course, anchor, onSave, onDelete, onClose,
}: {
  course?: Course;
  anchor?: DOMRect | null;
  onSave: (name: string, room: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(course?.name ?? "");
  const [room, setRoom] = useState(course?.room ?? "");
  const body = (
    <>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" className="mb-1.5 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-brand sm:py-1.5" />
      <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" className="mb-2 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-brand sm:py-1.5" />
      <div className="flex items-center justify-between">
        <button onClick={() => { if (name.trim()) { onSave(name.trim(), room.trim()); onClose(); } }} className="pressable px-3 py-2 text-xs sm:py-1.5">Save</button>
        <div className="flex gap-3">
          {onDelete && <button onClick={() => { onDelete(); onClose(); }} className="text-xs font-medium text-berry">Delete</button>}
          <button onClick={onClose} className="font-mono text-xs text-ink-faint">close</button>
        </div>
      </div>
    </>
  );
  // Editing an existing course → portal popover / bottom sheet so it never clips
  // off-screen. Adding a new one stays inline in the palette flow.
  if (course) return <Popover anchor={anchor ?? null} onClose={onClose} width={224} padding="p-2.5">{body}</Popover>;
  return <div className="panel animate-pop-in w-56 p-2.5">{body}</div>;
}

function HelpDrawer({ onClose }: { onClose: () => void }) {
  const steps: [string, string][] = [
    ["Add your courses", "In Edit mode, use “+ Add course” to create each class with its room. They appear as colored tiles."],
    ["Place them", "Tap a course tile to pick it up (it glows), then tap a grid cell. Or drag a tile onto a cell."],
    ["Shape the grid", "Add or remove time rows and breaks, edit the times directly, and click a day name to make it a weekend."],
    ["Fix a class", "Tap a placed class to Move it, Remove it, or change its Room."],
    ["This week only", "Switch to “This week” to cancel a class, change a room, add a one-off in an empty cell, or tap a day name to mark it off — all of it resets automatically."],
  ];
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-80 overflow-y-auto border-l border-line bg-surface p-5" style={{ boxShadow: "var(--shadow-pop)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">How it works</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">✕</button>
        </div>
        <ol className="flex flex-col gap-3.5">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint font-display text-sm font-bold text-brand">{i + 1}</span>
              <div>
                <div className="text-sm font-bold text-ink">{title}</div>
                <div className="mt-0.5 text-xs leading-5 text-ink-soft">{body}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 font-mono text-[11px] text-ink-faint">Reopen anytime from the “?” button — it never disappears for good.</p>
      </div>
    </div>
  );
}
