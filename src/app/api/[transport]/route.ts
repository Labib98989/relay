import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { aiTools, invokeTool } from "@/lib/ai/registry";
import { resolveContextFromBearer } from "@/lib/ai/tokenAuth";

// Stage 1: the remote MCP server Claude connects to as a custom connector
// (Settings → Connectors → https://<host>/api/mcp + a personal access token).
// mcp-handler owns the Streamable HTTP transport; the [transport] segment is
// its routing convention (with SSE disabled, only /api/mcp is live — no Redis
// needed). Every tool here is the shared catalog from src/lib/ai/tools.ts;
// auth is a per-request bearer-token lookup, never a session.

const handler = createMcpHandler(
  (server) => {
    for (const tool of aiTools) {
      server.tool(tool.name, tool.description, tool.shape, async (args, extra) => {
        const userId = (extra?.authInfo?.extra as { userId?: string } | undefined)?.userId;
        if (!userId) {
          return { content: [{ type: "text" as const, text: "Unauthorized — reconnect with a valid Relay token." }], isError: true };
        }
        try {
          const result = await invokeTool(tool.name, args, { userId, source: "mcp" });
          const text =
            result.data !== undefined
              ? `${result.summary}\n\n${JSON.stringify(result.data, null, 2)}`
              : result.summary;
          return { content: [{ type: "text" as const, text }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "The tool call failed.";
          return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
      });
    }
  },
  { serverInfo: { name: "relay", version: "1.0.0" } },
  { basePath: "/api", disableSse: true, maxDuration: 60 },
);

// Bearer → ApiToken lookup. Returning undefined makes withMcpAuth respond 401,
// which is also what a token revoked mid-session turns into on its next call.
async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const ctx = await resolveContextFromBearer(`Bearer ${bearer}`, "mcp");
  if (!ctx) return undefined;
  return { token: bearer, clientId: ctx.userId, scopes: [], extra: { userId: ctx.userId } };
}

const authedHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
