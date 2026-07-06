import { invokeTool, getToolByName } from "@/lib/ai/registry";
import { AiToolError } from "@/lib/ai/context";
import { resolveContextFromBearer } from "@/lib/ai/tokenAuth";

// Stage 2: one REST operation per tool (POST /api/gpt/<tool_name>), matching
// the operationIds the OpenAPI document declares. ChatGPT sends the configured
// API key as a bearer header; dispatch reuses the exact same invokeTool path
// as MCP and the in-app chat.

export async function POST(
  req: Request,
  ctx: { params: Promise<{ operationId: string }> },
) {
  // Next 16: params is a Promise and MUST be awaited.
  const { operationId } = await ctx.params;

  const authCtx = await resolveContextFromBearer(req.headers.get("authorization"), "openapi");
  if (!authCtx) {
    return Response.json({ error: "Missing or invalid API token." }, { status: 401 });
  }

  if (!getToolByName(operationId)) {
    return Response.json({ error: `Unknown operation "${operationId}".` }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Zero-argument tools (list_spaces) arrive with an empty body — fine.
  }

  try {
    const result = await invokeTool(operationId, body, authCtx);
    return Response.json(result);
  } catch (e) {
    if (e instanceof AiToolError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return Response.json({ error: "The tool call failed." }, { status: 500 });
  }
}
