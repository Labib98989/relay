import { prisma } from "@/lib/prisma";
import { DEFAULT_LAYOUT } from "@/lib/layout";
import { MAX_SPACES_PER_USER } from "@/app/dashboard/constants";

// Space creation shared by the dashboard form action and the AI create_space
// tool — the 5-per-CR limit and the seeded layout must be enforced identically
// no matter which door the request came through.
export async function createSpaceForUser(
  userId: string,
  rawName: string,
): Promise<{ id: string; name: string }> {
  const name = rawName.trim();
  if (!name) throw new Error("Space name is required");
  if (name.length > 60) throw new Error("Space name is too long");

  const existing = await prisma.scheduleSpace.count({ where: { ownerId: userId } });
  if (existing >= MAX_SPACES_PER_USER) {
    throw new Error(`You can have at most ${MAX_SPACES_PER_USER} spaces`);
  }

  // Seed the editing scaffold so the day's shape (periods + weekend) is SAVED
  // from the start, not re-derived from ephemeral defaults each session.
  const space = await prisma.scheduleSpace.create({
    data: { name, ownerId: userId, layout: DEFAULT_LAYOUT },
  });
  return { id: space.id, name: space.name };
}
