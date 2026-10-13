"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formToObject, runAction, type ActionResult } from "@/server/action-result";
import {
  actionAgencyContext,
  actionUser,
  actionWorkspaceContext,
  getRequestMeta,
  LAST_WORKSPACE_COOKIE,
} from "@/server/request";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/server/services/invitations";
import {
  createAgencyWithWorkspace,
  createWorkspace,
  removeAgencyMember,
  removeWorkspaceMember,
  setWorkspaceArchived,
  updateAgency,
  updateAgencyMemberRole,
  updateWorkspaceMemberRole,
  updateWorkspaceSettings,
} from "@/server/services/tenancy";

async function rememberWorkspace(workspaceId: string) {
  (await cookies()).set(LAST_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function onboardAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  let workspaceId: string | undefined;
  const result = await runAction(async () => {
    const user = await actionUser();
    const { workspace } = await createAgencyWithWorkspace(user.id, formToObject(formData), await getRequestMeta());
    workspaceId = workspace.id;
  });
  if (!result.ok || !workspaceId) return result;
  await rememberWorkspace(workspaceId);
  redirect(`/w/${workspaceId}`);
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<unknown>> {
  let target: string | undefined;
  const result = await runAction(async () => {
    const user = await actionUser();
    const { workspaceId, agencyId } = await acceptInvitation(user, token, await getRequestMeta());
    target = workspaceId ? `/w/${workspaceId}` : `/agency/${agencyId}`;
    if (workspaceId) await rememberWorkspace(workspaceId);
  });
  if (!result.ok || !target) return result;
  redirect(target);
}

export async function createWorkspaceAction(agencyId: string, _prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  let workspaceId: string | undefined;
  const result = await runAction(async () => {
    const ctx = await actionAgencyContext(agencyId);
    workspaceId = (await createWorkspace(ctx, formToObject(formData))).id;
  });
  if (!result.ok || !workspaceId) return result;
  await rememberWorkspace(workspaceId);
  redirect(`/w/${workspaceId}`);
}

export async function updateAgencyAction(agencyId: string, _prev: ActionResult<unknown>, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionAgencyContext(agencyId);
    await updateAgency(ctx, formToObject(formData));
    revalidatePath(`/agency/${agencyId}`, "layout");
  }, "Agency settings saved.");
}

export async function setWorkspaceArchivedAction(agencyId: string, workspaceId: string, archived: boolean) {
  return runAction(async () => {
    const ctx = await actionAgencyContext(agencyId);
    await setWorkspaceArchived(ctx, workspaceId, archived);
    revalidatePath(`/agency/${agencyId}`, "layout");
  }, archived ? "Workspace archived." : "Workspace restored.");
}

export async function updateWorkspaceSettingsAction(workspaceId: string, _prev: ActionResult<unknown>, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await updateWorkspaceSettings(ctx, formToObject(formData));
    revalidatePath(`/w/${workspaceId}`, "layout");
  }, "Workspace settings saved.");
}

export async function inviteAction(
  scope: { agencyId?: string; workspaceId?: string },
  _prev: ActionResult<{ url: string }>,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ctx = scope.workspaceId ? await actionWorkspaceContext(scope.workspaceId) : await actionAgencyContext(scope.agencyId);
    const { url } = await createInvitation(ctx, formToObject(formData));
    revalidatePath(scope.workspaceId ? `/w/${scope.workspaceId}/settings/members` : `/agency/${scope.agencyId}/members`);
    return { url };
  }, "Invitation created. Share the link below — it was also sent via the configured email adapter.");
}

export async function revokeInvitationAction(scope: { agencyId?: string; workspaceId?: string }, invitationId: string) {
  return runAction(async () => {
    const ctx = scope.workspaceId ? await actionWorkspaceContext(scope.workspaceId) : await actionAgencyContext(scope.agencyId);
    await revokeInvitation(ctx, invitationId);
    revalidatePath(scope.workspaceId ? `/w/${scope.workspaceId}/settings/members` : `/agency/${scope.agencyId}/members`);
  }, "Invitation revoked.");
}

export async function updateAgencyMemberRoleAction(agencyId: string, memberId: string, role: "OWNER" | "ADMIN") {
  return runAction(async () => {
    const ctx = await actionAgencyContext(agencyId);
    await updateAgencyMemberRole(ctx, memberId, role);
    revalidatePath(`/agency/${agencyId}/members`);
  }, "Role updated.");
}

export async function removeAgencyMemberAction(agencyId: string, memberId: string) {
  return runAction(async () => {
    const ctx = await actionAgencyContext(agencyId);
    await removeAgencyMember(ctx, memberId);
    revalidatePath(`/agency/${agencyId}/members`);
  }, "Member removed.");
}

export async function updateWorkspaceMemberRoleAction(workspaceId: string, memberId: string, role: "ADMIN" | "MEMBER") {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await updateWorkspaceMemberRole(ctx, memberId, role);
    revalidatePath(`/w/${workspaceId}/settings/members`);
  }, "Role updated.");
}

export async function removeWorkspaceMemberAction(workspaceId: string, memberId: string) {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await removeWorkspaceMember(ctx, memberId);
    revalidatePath(`/w/${workspaceId}/settings/members`);
  }, "Member removed.");
}

export async function rememberWorkspaceAction(workspaceId: string) {
  const ctx = await actionWorkspaceContext(workspaceId).catch(() => null);
  if (ctx) await rememberWorkspace(ctx.workspaceId);
}
