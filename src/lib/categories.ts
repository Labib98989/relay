import { EventCategory } from "@/generated/prisma/enums";

// The single source of truth for how each event category PRESENTS. The enum
// (in schema.prisma) is the stable key that's stored and routed on; the label,
// colour, emoji and Study/Non-study grouping all live here — so renaming a
// category or recolouring the calendar is a one-line change, never a migration.
//
// Colours reuse the design tokens from globals.css (var(--berry) etc.) so the
// calendar and its chips match Guy's look automatically in light and dark mode.

export type CategoryGroup = "STUDY" | "NON_STUDY";

export type CategoryMeta = {
  label: string;
  group: CategoryGroup;
  color: string; // a CSS colour token, e.g. "var(--berry)"
  emoji: string;
};

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  STUDY: "Study",
  NON_STUDY: "Non-study",
};

// Insertion order == display order (and matches the enum order in the schema).
export const CATEGORIES: Record<EventCategory, CategoryMeta> = {
  // — Study (academic) —
  EXAM: { label: "Exam", group: "STUDY", color: "var(--berry)", emoji: "📝" },
  CLASS_TEST: { label: "Class Test", group: "STUDY", color: "var(--brand)", emoji: "🧪" },
  QUIZ: { label: "Quiz", group: "STUDY", color: "var(--gold)", emoji: "❓" },
  ASSIGNMENT: { label: "Assignment", group: "STUDY", color: "var(--sky)", emoji: "📄" },
  PROJECT: { label: "Project", group: "STUDY", color: "var(--mint)", emoji: "🛠️" },
  PRESENTATION: { label: "Presentation", group: "STUDY", color: "var(--brand)", emoji: "📊" },
  LAB_REPORT: { label: "Lab Report", group: "STUDY", color: "var(--sky)", emoji: "🔬" },
  DEADLINE: { label: "Deadline", group: "STUDY", color: "var(--berry)", emoji: "⏰" },
  // — Non-study —
  NOTICE: { label: "Notice", group: "NON_STUDY", color: "var(--ink-soft)", emoji: "📢" },
  MEETUP: { label: "Meetup", group: "NON_STUDY", color: "var(--mint)", emoji: "🎉" },
  PAYMENT: { label: "Payment", group: "NON_STUDY", color: "var(--gold)", emoji: "💳" },
  HOLIDAY: { label: "Holiday", group: "NON_STUDY", color: "var(--mint)", emoji: "🌴" },
  OTHER: { label: "Other", group: "NON_STUDY", color: "var(--ink-faint)", emoji: "📌" },
};

// Ordered list of every category value (grid iteration, validation, filters).
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as EventCategory[];

export function categoryMeta(c: EventCategory): CategoryMeta {
  return CATEGORIES[c];
}

// Is a string a real EventCategory? Server Actions are reachable by direct POST,
// so every category write must pass this before touching the DB.
export function isEventCategory(v: unknown): v is EventCategory {
  return typeof v === "string" && v in CATEGORIES;
}

// Categories bucketed by group, in display order — drives the grouped picker
// (Study / Non-study) in the event form and the calendar's filter chips.
export function categoriesByGroup(): { group: CategoryGroup; label: string; categories: EventCategory[] }[] {
  const groups: CategoryGroup[] = ["STUDY", "NON_STUDY"];
  return groups.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    categories: CATEGORY_ORDER.filter((c) => CATEGORIES[c].group === group),
  }));
}

// ---------------------------------------------------------------------------
// Discord routing keys. A "post target" is anything a space can route to its
// own channel: the nightly digest, plus every event category. `resolveChannel`
// (src/lib/channels.ts) maps a key → channel, falling back to the main channel.
// ---------------------------------------------------------------------------

export const DIGEST_KEY = "DIGEST";
export type RouteKey = typeof DIGEST_KEY | EventCategory;

// The rows the Settings "channel routing" table renders, in order.
export function postTargets(): { key: RouteKey; label: string; emoji: string }[] {
  return [
    { key: DIGEST_KEY, label: "Nightly schedule digest", emoji: "🔔" },
    ...CATEGORY_ORDER.map((c) => ({ key: c, label: CATEGORIES[c].label, emoji: CATEGORIES[c].emoji })),
  ];
}
