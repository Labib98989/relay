// @relay-test-button — temporary manual pipeline pokes; grep this tag to remove.
//
// Test harness for the Stage-3 chat pipeline, exposed as an endpoint so the
// chat page's test controls (and curl) can drive it:
//   • mode "ping"  — one tiny completion, no tools: is the provider reachable?
//   • mode "suite" — the tool-SELECTION test suite from the plan: for each
//     scripted prompt, run the real loop but INTERCEPT mutations — read-only
//     tools execute for real (harmless), the first mutating tool call is
//     recorded as the model's decision and faked, never executed. Pass/fail is
//     "did the model pick the right tool", especially temporary-vs-permanent.
//
// Auth: dashboard session OR a bearer ApiToken (so the suite is scriptable
// from the CLI without a browser login). Test-only surface — remove with the
// rest of the @relay-test-button sites before any public deploy.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveContextFromSession, type AiActionContext } from "@/lib/ai/context";
import { resolveContextFromBearer } from "@/lib/ai/tokenAuth";
import { getToolByName, invokeTool, toChatFunctionDefs } from "@/lib/ai/registry";
import { getProvider } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/ai/providers/types";
import { todayUTC6, weekdayFromDate } from "@/lib/week";

const MAX_STEPS = 4;

type SuiteCase = {
  prompt: string;
  // The mutating tool(s) that count as a pass; null = no mutation may fire
  // (read-only question or a clarifying-question situation).
  expected: string[] | null;
};

const SUITE: SuiteCase[] = [
  { prompt: "Move my Thursday class to 3pm", expected: ["reschedule_class_once"] },
  { prompt: "Permanently move my Monday class to 9am, every week from now on", expected: ["edit_permanent_schedule"] },
  { prompt: "Cancel tomorrow's class", expected: ["cancel_class_once"] },
  { prompt: "What's on my schedule this week?", expected: null },
  { prompt: "Add a quiz next Wednesday for Discrete Math", expected: ["add_event"] },
  { prompt: "Change the room for Thursday's class to Room 302, just for this week", expected: ["change_room_once"] },
  { prompt: "Permanently change my Thursday class's room to 302", expected: ["update_course"] },
  { prompt: "Thursday's class needs to move", expected: null }, // no time given → should ask, not act
];

function systemPrompt(space: { id: string; name: string; hour12: boolean }): string {
  // Mirrors the real chat route's prompt so the suite measures real behavior.
  const today = todayUTC6();
  return [
    `You are Relay's schedule assistant for the class-section space "${space.name}" (spaceId: ${space.id}).`,
    `Today is ${today.toISOString().slice(0, 10)} (${weekdayFromDate(today)}) in the schedule's timezone (UTC+6).`,
    "You manage the weekly class schedule, one-time changes, and calendar events via tools.",
    "Rules:",
    "- Schedule changes are TEMPORARY by default (the *_once tools, affecting only the upcoming occurrence). Only use a permanent tool when the user explicitly says the change is permanent ('permanently', 'every week', 'from now on').",
    "- Call get_schedule before any change — slotIds and courseIds come from it. Never invent ids.",
    "- If required details are missing (like a time), ask instead of guessing.",
    "- Be brief and confirm what changed after each action.",
  ].join("\n");
}

async function resolveAnyContext(req: Request): Promise<AiActionContext | null> {
  try {
    return await resolveContextFromSession("chat");
  } catch {
    return resolveContextFromBearer(req.headers.get("authorization"), "openapi");
  }
}

export async function POST(req: Request) {
  const ctx = await resolveAnyContext(req);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { spaceId?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.spaceId !== "string") return Response.json({ error: "spaceId required" }, { status: 400 });

  const space = await prisma.scheduleSpace.findFirst({
    where: { id: body.spaceId, ownerId: ctx.userId },
    select: { id: true, name: true, hour12: true },
  });
  if (!space) return Response.json({ error: "Space not found" }, { status: 404 });

  const provider = getProvider();

  if (body.mode === "ping") {
    try {
      const turn = await provider.chat(
        [
          { role: "system", content: "Reply with exactly: OK" },
          { role: "user", content: "ping" },
        ],
        [],
      );
      return Response.json({
        ok: true,
        provider: process.env.AI_CHAT_PROVIDER ?? "ollama",
        model: process.env.AI_CHAT_PROVIDER === "gemini"
          ? process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
          : process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b-instruct",
        reply: turn.type === "message" ? turn.content.slice(0, 80) : "(tool call?)",
      });
    } catch (e) {
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "provider unreachable" },
        { status: 502 },
      );
    }
  }

  if (body.mode !== "suite") return Response.json({ error: 'mode must be "ping" or "suite"' }, { status: 400 });

  const tools = toChatFunctionDefs();
  const results = [];

  for (const testCase of SUITE) {
    const history: ChatMessage[] = [
      { role: "system", content: systemPrompt(space) },
      { role: "user", content: testCase.prompt },
    ];
    const trail: string[] = [];
    let decision: string | null = null;
    let argsValid: boolean | null = null;
    let finalMessage: string | null = null;
    let caseError: string | null = null;

    try {
      steps: for (let i = 0; i < MAX_STEPS; i++) {
        const turn = await provider.chat(history, tools);
        if (turn.type === "message") {
          finalMessage = turn.content.slice(0, 200);
          break;
        }
        history.push({ role: "assistant", content: null, toolCalls: turn.calls });
        for (const call of turn.calls) {
          const tool = getToolByName(call.name);
          trail.push(call.name);
          if (!tool) {
            history.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ error: `Unknown tool ${call.name}` }) });
            continue;
          }
          if (tool.readOnly) {
            // Reads run for real so the model gets genuine slotIds/courseIds.
            try {
              const r = await invokeTool(call.name, call.arguments, ctx);
              history.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(r) });
            } catch (e) {
              history.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ error: e instanceof Error ? e.message : "failed" }) });
            }
          } else {
            // First mutation = the model's decision. Validate args but DO NOT
            // execute — the suite must never touch real schedule data.
            decision = call.name;
            argsValid = z.object(tool.shape).safeParse(call.arguments ?? {}).success;
            break steps;
          }
        }
      }
    } catch (e) {
      caseError = e instanceof Error ? e.message : "provider error";
    }

    const pass = caseError
      ? false
      : testCase.expected === null
        ? decision === null
        : decision !== null && testCase.expected.includes(decision);

    results.push({
      prompt: testCase.prompt,
      expected: testCase.expected ?? "(no mutation)",
      decision: decision ?? "(none)",
      argsValid,
      toolTrail: trail,
      finalMessage,
      error: caseError,
      pass,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    provider: process.env.AI_CHAT_PROVIDER ?? "ollama",
    model: process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b-instruct",
    passed,
    total: results.length,
    results,
  });
}
