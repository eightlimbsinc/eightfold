"use server";
import { revalidatePath } from "next/cache";
import { actionUser, actionWorkspaceContext } from "@/server/request";
import { globalSearch, type SearchResults } from "@/server/services/search";
import { markNotificationsRead } from "@/server/services/notifications";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { profileInput } from "@/lib/validation/tenancy";
import { parseInput } from "@/server/services/parse";
import { runAction, type ActionResult } from "@/server/action-result";

export async function searchAction(workspaceId: string, q: string): Promise<SearchResults> {
  try {
    const ctx = await actionWorkspaceContext(workspaceId);
    return await globalSearch(ctx, String(q ?? ""));
  } catch {
    return { contacts: [], opportunities: [], tasks: [] };
  }
}

export async function markNotificationsReadAction() {
  const user = await actionUser();
  await markNotificationsRead(user.id);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const user = await actionUser();
    const input = parseInput(profileInput, { name: formData.get("name") });
    await prisma.user.update({ where: { id: user.id }, data: { name: input.name } });
    await recordAudit(prisma, { userId: user.id }, { action: "user.profile_updated", targetType: "user", targetId: user.id });
    revalidatePath("/", "layout");
  }, "Profile saved.");
}
