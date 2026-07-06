import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AiActionContext } from "./context";

// Personal-access-token auth for the external AI transports (Claude MCP
// connector, ChatGPT Custom GPT Actions). Same shape as the CRON_SECRET check
// in /api/cron/post, generalised to a per-user DB lookup: the plaintext is
// handed out once at creation, only its SHA-256 lands in the ApiToken table.
// SHA-256 (not bcrypt) is deliberate — a 32-byte random token isn't a password,
// and every single tool call re-hashes it for the lookup.

const TOKEN_PREFIX = "rly_";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateTokenPlaintext(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

// The non-secret label shown in the token list so a user can tell them apart.
export function tokenDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, TOKEN_PREFIX.length + 6);
}

// "Authorization: Bearer rly_..." → the acting user, or null (→ 401 upstream).
export async function resolveContextFromBearer(
  authorization: string | null | undefined,
  source: "mcp" | "openapi",
): Promise<AiActionContext | null> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const row = await prisma.apiToken.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null },
    select: { id: true, userId: true },
  });
  if (!row) return null;

  // Fire-and-forget: "last used" powers the settings UI's staleness hint, and
  // must never add latency or failure modes to the tool call itself.
  prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.userId, source };
}
