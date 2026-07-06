import { getPublicOrigin } from "mcp-handler";
import { toOpenApiSpec } from "@/lib/ai/registry";

// Stage 2: the OpenAPI 3.1 document a ChatGPT Custom GPT imports as its
// Actions schema ("Import from URL" in the GPT builder). The document itself
// is public — it's just the API's shape; every operation it declares requires
// the same bearer token as MCP. getPublicOrigin respects X-Forwarded-* so the
// server URL is right behind a tunnel or reverse proxy.
export async function GET(req: Request) {
  return Response.json(toOpenApiSpec(getPublicOrigin(req)));
}
