import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { loadWorkspaceContext, loadAgencyContext } from "@/server/authz/context";
import { createAgencyWithWorkspace } from "@/server/services/tenancy";

export async function createUser(name = "Test User", email?: string) {
  return prisma.user.create({
    data: { id: randomUUID(), name, email: email ?? `${randomUUID().slice(0, 8)}@example.test` },
  });
}

/** Creates a user who owns a new agency with one workspace (and default pipeline). */
export async function createAgencyOwner(label = "Acme") {
  const user = await createUser(`${label} Owner`);
  const { agency, workspace } = await createAgencyWithWorkspace(user.id, {
    agencyName: `${label} Agency`,
    workspaceName: `${label} Client`,
    timezone: "UTC",
  });
  return { user, agency, workspace, ctx: await wsCtx(user.id, workspace.id), agencyCtx: await agencyCtx(user.id, agency.id) };
}

export async function wsCtx(userId: string, workspaceId: string) {
  const ctx = await loadWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error(`User ${userId} has no access to workspace ${workspaceId}`);
  return ctx;
}

export async function agencyCtx(userId: string, agencyId: string) {
  const ctx = await loadAgencyContext(userId, agencyId);
  if (!ctx) throw new Error(`User ${userId} has no access to agency ${agencyId}`);
  return ctx;
}

export async function addWorkspaceMember(workspaceId: string, role: "ADMIN" | "MEMBER", name = "Member") {
  const user = await createUser(name);
  await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return { user, ctx: await wsCtx(user.id, workspaceId) };
}

export async function defaultPipeline(workspaceId: string) {
  return prisma.pipeline.findFirstOrThrow({
    where: { workspaceId },
    include: { stages: { orderBy: { position: "asc" } } },
  });
}
