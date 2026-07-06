"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTokenPlaintext, hashToken, tokenDisplayPrefix } from "@/lib/ai/tokenAuth";

// User-level (not space-level) actions: personal access tokens for the AI
// connectors. Same trust-boundary convention as every other action file —
// re-derive the session user here and scope every query to them.

async function userId(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

export type ApiTokenSummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string; // ISO — serialized for the client component
  lastUsedAt: string | null;
};

// Creates a token and returns the plaintext EXACTLY ONCE — only its hash is
// stored, so this is the caller's single chance to copy it.
export async function createApiToken(name: string): Promise<{ token: ApiTokenSummary; plaintext: string }> {
  const uid = await userId();
  const label = name.trim().slice(0, 60) || "Unnamed token";

  const plaintext = generateTokenPlaintext();
  const row = await prisma.apiToken.create({
    data: {
      userId: uid,
      tokenHash: hashToken(plaintext),
      prefix: tokenDisplayPrefix(plaintext),
      name: label,
    },
  });

  revalidatePath("/dashboard/account");
  return {
    plaintext,
    token: {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
    },
  };
}

// Soft delete: the row stays for the audit trail, but auth checks require
// revokedAt to be null, so the token stops working immediately.
export async function revokeApiToken(tokenId: string): Promise<void> {
  const uid = await userId();
  await prisma.apiToken.updateMany({
    where: { id: tokenId, userId: uid, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/dashboard/account");
}
