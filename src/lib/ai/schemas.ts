import { z } from "zod";
import type { EventCategory } from "@/generated/prisma/enums";
import { CATEGORY_ORDER, DIGEST_KEY } from "@/lib/categories";

// Shared zod primitives for the AI tool inputs. Formats mirror the storage
// invariants the Server Actions enforce (see src/lib/time.ts / week.ts): times
// are zero-padded 24h "HH:MM", dates are "YYYY-MM-DD" UTC+6 wall-clock.

export const weekday = z
  .enum(["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"])
  .describe("Day of the week (uppercase English)");

export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be 24-hour HH:MM, e.g. 09:30 or 15:00")
  .describe("24-hour time as HH:MM, e.g. \"15:00\" for 3pm");

export const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .describe("Calendar date as YYYY-MM-DD");

export const eventCategory = z
  .enum(CATEGORY_ORDER as [EventCategory, ...EventCategory[]])
  .describe("Event category");

export const routeKey = z
  .enum([DIGEST_KEY, ...CATEGORY_ORDER] as [string, ...string[]])
  .describe('Post target: "DIGEST" (the nightly schedule post) or an event category');

export const spaceId = z.string().min(1).describe("The schedule space id (from list_spaces)");

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color");

// The two-key gate on permanent-schedule tools. `confirmedPermanent` must be
// literally true, and `userStatedPermanence` forces the model to quote the
// user's own permanence language — a wrong-tool call fails validation instead
// of silently rewriting the weekly timetable.
export const permanenceGate = {
  confirmedPermanent: z
    .literal(true)
    .describe(
      "Set to true ONLY if the user explicitly said this change is permanent " +
        "(words like 'permanently', 'every week', 'from now on'). If they did not, " +
        "do not call this tool — use the *_once tools instead.",
    ),
  userStatedPermanence: z
    .string()
    .min(3)
    .describe(
      "Quote or closely paraphrase the exact words the user used that show they " +
        "want a PERMANENT change (e.g. \"permanently move it to 3pm\").",
    ),
};
