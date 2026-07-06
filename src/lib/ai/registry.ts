import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { runAsUser } from "./actor";
import { type AiActionContext, AiToolError } from "./context";
import { aiTools, type AiTool, type AiToolResult } from "./tools";

// Transport-agnostic dispatch + the per-transport views over the one canonical
// catalog in tools.ts. The MCP route registers the tools directly (the MCP SDK
// takes zod shapes as-is); ChatGPT Actions and the in-app chat need JSON-Schema
// renderings, produced here so the steering descriptions stay byte-identical
// across all three doors.

export { aiTools };

export function getToolByName(name: string): AiTool | undefined {
  return aiTools.find((t) => t.name === name);
}

// The single entry point every transport funnels tool calls through: validate
// against the tool's schema, then run the handler AS the verified user (the
// AsyncLocalStorage scope is what lets the existing Server Actions resolve the
// caller without a cookie session — see actor.ts).
export async function invokeTool(
  name: string,
  rawInput: unknown,
  ctx: AiActionContext,
): Promise<AiToolResult> {
  const tool = getToolByName(name);
  if (!tool) throw new AiToolError(`Unknown tool "${name}".`);

  const parsed = z.object(tool.shape).safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`)
      .join("; ");
    throw new AiToolError(`Invalid input for ${name} — ${issues}`);
  }

  try {
    const result = await runAsUser(ctx.userId, () => tool.handler(parsed.data, ctx));
    console.log(JSON.stringify({ ai_tool: name, source: ctx.source, userId: ctx.userId, ok: true }));
    return result;
  } catch (e) {
    console.log(JSON.stringify({
      ai_tool: name, source: ctx.source, userId: ctx.userId, ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    // Server Actions throw plain Errors with user-facing messages ("Space not
    // found", "Times must be HH:MM") — safe to relay to the model so it can
    // self-correct. Anything non-Error stays generic.
    if (e instanceof AiToolError) throw e;
    if (e instanceof Error && e.message) throw new AiToolError(e.message);
    throw new AiToolError("The tool call failed.");
  }
}

function toolJsonSchema(tool: AiTool): Record<string, unknown> {
  // target: "openApi3" keeps nullable/unions in shapes both the GPT Actions
  // builder and OpenAI-compatible function calling accept; $refStrategy "none"
  // inlines everything (tiny flat schemas — refs are just noise here).
  const schema = zodToJsonSchema(z.object(tool.shape), { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/* ------------------------- Stage 2: OpenAPI (GPT Actions) ------------------ */

export function toOpenApiSpec(origin: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const tool of aiTools) {
    paths[`/api/gpt/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.description.split(". ")[0],
        description: tool.description,
        "x-openai-isConsequential": !tool.readOnly,
        requestBody: {
          required: true,
          content: { "application/json": { schema: toolJsonSchema(tool) } },
        },
        responses: {
          "200": {
            description: "Tool result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Human-readable outcome" },
                    data: { description: "Structured result data, when applicable" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid input" },
          "401": { description: "Missing or revoked API token" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Relay",
      version: "1.0.0",
      description:
        "Control a Relay class-schedule space: read the weekly schedule, make temporary " +
        "(one-occurrence) or permanent changes, and manage calendar events. Ambiguous " +
        "change requests default to temporary — see each operation's description.",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Relay personal access token (rly_...)" },
      },
    },
  };
}

/* ---------------- Stage 3: OpenAI-compatible function calling --------------- */

export type ChatFunctionDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

// The in-app chat runs against small local models in dev, and 25 tool schemas
// overflow their context window (qwen2.5:1.5b returned empty replies with the
// full catalog — verified 2026-07-05). The chat transport therefore exposes a
// core subset covering the everyday requests; MCP and GPT Actions (frontier
// models) always get the full catalog. Set AI_CHAT_FULL_TOOLS=1 to give the
// chat the full set too (fine on Gemini Flash and other hosted models).
const CHAT_CORE_TOOLS = new Set([
  "list_spaces", "get_schedule", "list_upcoming_events",
  "reschedule_class_once", "cancel_class_once", "change_room_once",
  "clear_class_change_once", "add_extra_class_once", "set_day_off_once",
  "edit_permanent_schedule", "update_course",
  "add_event", "update_event", "delete_event",
]);

export function toChatFunctionDefs(): ChatFunctionDef[] {
  const full = process.env.AI_CHAT_FULL_TOOLS === "1";
  return aiTools
    .filter((tool) => full || CHAT_CORE_TOOLS.has(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toolJsonSchema(tool),
      },
    }));
}
