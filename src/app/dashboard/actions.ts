"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createSpaceForUser } from "@/lib/spaces";

export async function createSpace(formData: FormData) {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Name validation and the 5-per-CR limit are enforced in createSpaceForUser —
  // shared with the AI create_space tool so both doors apply the same rules.
  // (A Server Action is reachable by direct POST, so the guard lives server-side.)
  const space = await createSpaceForUser(session.user.id, String(formData.get("name") ?? ""));

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
  // Deleting from a space's Settings page would otherwise land on a now-404 route;
  // send everyone back to the hub. (From the hub card this is a no-op redirect.)
  redirect("/dashboard");
}
