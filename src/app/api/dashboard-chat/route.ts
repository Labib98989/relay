import { prisma } from "@/lib/prisma";
import { todayUTC6, weekdayFromDate } from "@/lib/week";
import { resolveContextFromSession } from "@/lib/ai/context";
import { invokeTool, toChatFunctionDefs } from "@/lib/ai/registry";
import { getProvider } from "@/lib/ai/providers";
import type { ChatMessage, ToolCall } from "@/lib/ai/providers/types";

// Stage 3: the in-app assistant. Unlike MCP/GPT Actions, Relay's own backend
// runs the tool-calling loop here, against whatever provider is configured
// (local Ollama in dev, Gemini Flash in prod). Auth is the dashboard session —
// the browser's same-origin fetch carries the cookie; no API token involved.
//
// The client sends its transcript back each turn and receives an updated one
// (tool messages included, so multi-turn context like slotIds survives). The
// transcript is client-held state and therefore untrusted — every tool call
// still re-verifies ownership server-side; tampering can only confuse the
// model's context, never widen access.

// Small local models loop on tools more readily than frontier ones — bound it.
const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_MESSAGES = 40;

function systemPrompt(space: { id: string; name: string; hour12: boolean }): string {
  const today = todayUTC6();
  return [
    `You are Relay's schedule assistant for the class-section space "${space.name}" (spaceId: ${space.id}).`,
    `Today is ${today.toISOString().slice(0, 10)} (${weekdayFromDate(today)}) in the schedule's timezone (UTC+6).`,
    "You manage the weekly class schedule, one-time changes, and calendar events via tools.",
    "Rules:",
    "- Schedule changes are TEMPORARY by default (the *_once tools, affecting only the upcoming occurrence). Only use a permanent tool when the user explicitly says the change is permanent ('permanently', 'every week', 'from now on').",
    "- Call get_schedule before any change — slotIds and courseIds come from it. Never invent ids.",
    "- If required details are missing (like a time), ask instead of guessing.",
    `- Format times ${space.hour12 ? "12-hour (e.g. 3:00 PM)" : "24-hour (e.g. 15:00)"} in replies.`,
    "- Be brief and confirm what changed after each action.",
  ].join("\n");
}

// The transcript arrives from the client — keep only shapes the loop knows,
// and never accept a client-supplied system message.
function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const msg = m as Record<string, unknown>;
    if (msg.role === "user" && typeof msg.content === "string") {
      out.push({ role: "user", content: msg.content.slice(0, 4000) });
    } else if (msg.role === "assistant" && (typeof msg.content === "string" || msg.content === null)) {
      const toolCalls = Array.isArray(msg.toolCalls)
        ? (msg.toolCalls as ToolCall[]).filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
        : undefined;
      out.push({ role: "assistant", content: msg.content as string | null, ...(toolCalls?.length ? { toolCalls } : {}) });
    } else if (msg.role === "tool" && typeof msg.content === "string" && typeof msg.toolCallId === "string") {
      out.push({ role: "tool", toolCallId: msg.toolCallId, content: msg.content });
    }
  }
  return out.slice(-MAX_HISTORY_MESSAGES);
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await resolveContextFromSession("chat");
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { spaceId?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.spaceId !== "string") {
    return Response.json({ error: "spaceId is required" }, { status: 400 });
  }

  // Ownership gate before any model call — same query shape as the layouts'.
  const space = await prisma.scheduleSpace.findFirst({
    where: { id: body.spaceId, ownerId: ctx.userId },
    select: { id: true, name: true, hour12: true },
  });
  if (!space) return Response.json({ error: "Space not found" }, { status: 404 });

  const transcript = sanitizeHistory(body.messages);
  if (transcript.length === 0 || transcript[transcript.length - 1].role !== "user") {
    return Response.json({ error: "The last message must be from the user." }, { status: 400 });
  }

  const provider = getProvider();
  const tools = toChatFunctionDefs();
  const history: ChatMessage[] = [{ role: "system", content: systemPrompt(space) }, ...transcript];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const turn = await provider.chat(history, tools);

      if (turn.type === "message") {
        history.push({ role: "assistant", content: turn.content });
        return Response.json({ reply: turn.content, messages: history.slice(1) });
      }

      history.push({ role: "assistant", content: null, toolCalls: turn.calls });
      for (const call of turn.calls) {
        let content: string;
        try {
          // assertOwnedSpaceFor inside each tool re-checks; this loop only ever
          // acts as the session user.
          const result = await invokeTool(call.name, call.arguments, ctx);
          content = JSON.stringify(result);
        } catch (e) {
          content = JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" });
        }
        history.push({ role: "tool", toolCallId: call.id, content });
      }
    }

    const fallback = "I couldn't finish that within a reasonable number of steps — try rephrasing or splitting the request.";
    history.push({ role: "assistant", content: fallback });
    return Response.json({ reply: fallback, messages: history.slice(1) });
  } catch (e) {
    // Provider unreachable (e.g. Ollama not running) or hard backend error.
    const msg = e instanceof Error ? e.message : "Chat backend failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
