"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LAYOUT } from "@/lib/layout";
import { MAX_SPACES_PER_USER } from "./constants";

export async function createSpace(formData: FormData) {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Space name is required");
  }
  if (name.length > 60) {
    throw new Error("Space name is too long");
  }

  // Enforce the 5-per-CR rule on the server. The UI also hides the form at the
  // limit, but a Server Action is reachable by direct POST — so the real guard
  // must live here, never only in the UI.
  const existing = await prisma.scheduleSpace.count({
    where: { ownerId: session.user.id },
  });
  if (existing >= MAX_SPACES_PER_USER) {
    throw new Error(`You can have at most ${MAX_SPACES_PER_USER} spaces`);
  }

  // Seed the editing scaffold so the day's shape (periods + weekend) is SAVED
  // from the start, not re-derived from ephemeral defaults each session.
  const space = await prisma.scheduleSpace.create({
    data: { name, ownerId: session.user.id, layout: DEFAULT_LAYOUT },
  });

  redirect(`/dashboard/${space.id}`);
}

export async function deleteSpace(formData: FormData) {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const id = String(formData.get("id") ?? "");

  // Scope the delete to the owner: a non-owner's id simply matches zero rows
  // instead of deleting someone else's space.
  await prisma.scheduleSpace.deleteMany({
    where: { id, ownerId: session.user.id },
  });

  revalidatePath("/dashboard");
}
