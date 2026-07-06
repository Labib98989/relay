import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Who is calling an AI tool, and through which door. The userId is ALWAYS
// resolved server-side (bearer token lookup or session) — never read from tool
// input, which the model controls.

export type AiSource = "mcp" | "openapi" | "chat";

export type AiActionContext = {
  userId: string;
  source: AiSource;
};

// A tool failure whose message is safe (and useful) to show the model/user —
// validation problems, missing rows, limits. Anything else surfaces as a
// generic error so internals don't leak into chat transcripts.
export class AiToolError extends Error {}

// Stage 3 (in-app chat): the caller is the already-signed-in dashboard user.
export async function resolveContextFromSession(source: AiSource = "chat"): Promise<AiActionContext> {
  const session = await auth();
  if (!session) throw new AiToolError("Unauthorized");
  return { userId: session.user.id, source };
}

// Every tool that takes a spaceId re-verifies ownership here BEFORE touching
// anything — same trust boundary as the Server Actions (which check again
// themselves; belt and suspenders, since both layers are reachable directly).
export async function assertOwnedSpaceFor(
  ctx: AiActionContext,
  spaceId: string,
): Promise<{ id: string; name: string; hour12: boolean }> {
  const space = await prisma.scheduleSpace.findFirst({
    where: { id: spaceId, ownerId: ctx.userId },
    select: { id: true, name: true, hour12: true },
  });
  if (!space) throw new AiToolError("Space not found — call list_spaces to see your valid space ids.");
  return space;
}
