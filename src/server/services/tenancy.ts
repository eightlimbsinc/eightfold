/**
 * Agency and workspace management: onboarding, settings, archiving, and
 * membership administration.
 */
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import {
  assertPermission,
  type AgencyContext,
  type RequestMeta,
  type WorkspaceContext,
} from "../authz/context";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { recordAudit } from "./audit";
import { canAssignRole, agencyRoleToRole, workspaceRoleToRole } from "@/lib/permissions";
import { slugify } from "@/lib/utils";
import { agencyInput, onboardingInput, workspaceInput, workspaceSettingsInput } from "@/lib/validation/tenancy";
import { parseInput } from "./parse";

export const DEFAULT_PIPELINE = {
  name: "Sales Pipeline",
  stages: [
    { name: "New Lead", probability: 10 },
    { name: "Contacted", probability: 20 },
    { name: "Qualified", probability: 40 },
    { name: "Proposal Sent", probability: 60 },
    { name: "Negotiation", probability: 80 },
  ],
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function withSuffix(base: string): string {
  return `${base || "agency"}-${randomBytes(3).toString("hex")}`;
}

async function createDefaultPipeline(tx: Db, workspaceId: string) {
  const pipeline = await tx.pipeline.create({ data: { workspaceId, name: DEFAULT_PIPELINE.name } });
  await tx.pipelineStage.createMany({
    data: DEFAULT_PIPELINE.stages.map((s, position) => ({ ...s, position, workspaceId, pipelineId: pipeline.id })),
  });
  return pipeline;
}

/** Retries a create when a generated slug collides with an existing one. */
async function withUniqueSlug<T>(base: string, create: (slug: string) => Promise<T>): Promise<T> {
  let slug = base || withSuffix("");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await create(slug);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      slug = withSuffix(base);
    }
  }
  throw new ConflictError("Could not generate a unique identifier. Please try a different name.");
}

/**
 * First-run onboarding: creates an agency owned by the user, its first client
 * workspace, and a default sales pipeline — atomically.
 */
export async function createAgencyWithWorkspace(userId: string, raw: unknown, request?: RequestMeta) {
  const input = parseInput(onboardingInput, raw);
  return withUniqueSlug(slugify(input.agencyName), (slug) =>
    prisma.$transaction(async (tx) => {
      const agency = await tx.agency.create({
        data: { name: input.agencyName, slug, createdById: userId, members: { create: { userId, role: "OWNER" } } },
      });
      const workspace = await tx.workspace.create({
        data: {
          agencyId: agency.id,
          name: input.workspaceName,
          slug: slugify(input.workspaceName) || "workspace",
          timezone: input.timezone,
        },
      });
      await createDefaultPipeline(tx, workspace.id);
      await recordAudit(tx, { userId, request } as { userId: string }, {
        action: "agency.created",
        agencyId: agency.id,
        targetType: "agency",
        targetId: agency.id,
        metadata: { name: agency.name, workspaceId: workspace.id },
      });
      return { agency, workspace };
    }),
  );
}

export async function updateAgency(ctx: AgencyContext, raw: unknown) {
  assertPermission(ctx, "agency:update");
  const input = parseInput(agencyInput, raw);
  return prisma.$transaction(async (tx) => {
    const agency = await tx.agency.update({ where: { id: ctx.agencyId }, data: { name: input.name } });
    await recordAudit(tx, ctx, { action: "agency.updated", targetType: "agency", targetId: agency.id, metadata: { name: input.name } });
    return agency;
  });
}

export async function createWorkspace(ctx: AgencyContext, raw: unknown) {
  assertPermission(ctx, "workspace:create");
  const input = parseInput(workspaceInput, raw);
  return withUniqueSlug(slugify(input.name) || "workspace", (slug) =>
    prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { agencyId: ctx.agencyId, name: input.name, slug, timezone: input.timezone, currency: input.currency },
      });
      await createDefaultPipeline(tx, workspace.id);
      await recordAudit(tx, ctx, {
        action: "workspace.created",
        workspaceId: workspace.id,
        targetType: "workspace",
        targetId: workspace.id,
        metadata: { name: workspace.name },
      });
      return workspace;
    }),
  );
}

export async function listAgencyWorkspaces(ctx: AgencyContext) {
  assertPermission(ctx, "agency:read");
  return prisma.workspace.findMany({
    where: { agencyId: ctx.agencyId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      currency: true,
      archivedAt: true,
      createdAt: true,
      _count: { select: { contacts: { where: { archivedAt: null } }, members: true, opportunities: { where: { status: "OPEN", archivedAt: null } } } },
    },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
}

export async function updateWorkspaceSettings(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "workspace:update");
  const input = parseInput(workspaceSettingsInput, raw);
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: { name: input.name, timezone: input.timezone, currency: input.currency, duplicatePolicy: input.duplicatePolicy },
    });
    await recordAudit(tx, ctx, {
      action: "workspace.settings_updated",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      metadata: { ...input },
    });
    return workspace;
  });
}

export async function setWorkspaceArchived(ctx: AgencyContext, workspaceId: string, archived: boolean) {
  assertPermission(ctx, "workspace:archive");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workspace.findFirst({ where: { id: workspaceId, agencyId: ctx.agencyId } });
    if (!existing) throw new NotFoundError("Workspace");
    const workspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordAudit(tx, ctx, {
      action: archived ? "workspace.archived" : "workspace.restored",
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
    });
    return workspace;
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function listAgencyMembers(ctx: AgencyContext) {
  assertPermission(ctx, "agency:read");
  const [agencyMembers, workspaceMembers] = await Promise.all([
    prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workspaceMember.findMany({
      where: { workspace: { agencyId: ctx.agencyId } },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { agencyMembers, workspaceMembers };
}

async function assertNotLastOwner(tx: Db, agencyId: string, memberId: string) {
  const owners = await tx.agencyMember.findMany({ where: { agencyId, role: "OWNER" }, select: { id: true } });
  if (owners.length === 1 && owners[0].id === memberId) {
    throw new ConflictError("An agency must keep at least one owner.");
  }
}

export async function updateAgencyMemberRole(ctx: AgencyContext, memberId: string, role: "OWNER" | "ADMIN") {
  assertPermission(ctx, "agency:members:manage");
  return prisma.$transaction(async (tx) => {
    const member = await tx.agencyMember.findFirst({ where: { id: memberId, agencyId: ctx.agencyId } });
    if (!member) throw new NotFoundError("Member");
    if (!canAssignRole(ctx.role, agencyRoleToRole(member.role)) || !canAssignRole(ctx.role, agencyRoleToRole(role))) {
      throw new ForbiddenError("Only agency owners can grant or change the owner role.");
    }
    if (member.role === "OWNER" && role !== "OWNER") await assertNotLastOwner(tx, ctx.agencyId, member.id);
    const updated = await tx.agencyMember.update({ where: { id: member.id }, data: { role } });
    await recordAudit(tx, ctx, {
      action: "agency.member_role_changed",
      targetType: "user",
      targetId: member.userId,
      metadata: { from: member.role, to: role },
    });
    return updated;
  });
}

export async function removeAgencyMember(ctx: AgencyContext, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.agencyMember.findFirst({ where: { id: memberId, agencyId: ctx.agencyId } });
    if (!member) throw new NotFoundError("Member");
    const isSelf = member.userId === ctx.userId;
    if (!isSelf) {
      assertPermission(ctx, "agency:members:manage");
      if (!canAssignRole(ctx.role, agencyRoleToRole(member.role))) {
        throw new ForbiddenError("Only agency owners can remove an owner.");
      }
    }
    if (member.role === "OWNER") await assertNotLastOwner(tx, ctx.agencyId, member.id);
    await tx.agencyMember.delete({ where: { id: member.id } });
    await recordAudit(tx, ctx, { action: "agency.member_removed", targetType: "user", targetId: member.userId, metadata: { role: member.role } });
  });
}

export async function listWorkspaceMembers(ctx: WorkspaceContext) {
  assertPermission(ctx, "workspace:read");
  const [members, agencyAdmins] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId },
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { members, agencyAdmins };
}

export async function updateWorkspaceMemberRole(ctx: WorkspaceContext, memberId: string, role: "ADMIN" | "MEMBER") {
  assertPermission(ctx, "workspace:members:manage");
  return prisma.$transaction(async (tx) => {
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspaceId } });
    if (!member) throw new NotFoundError("Member");
    if (!canAssignRole(ctx.role, workspaceRoleToRole(role))) throw new ForbiddenError();
    const updated = await tx.workspaceMember.update({ where: { id: member.id }, data: { role } });
    await recordAudit(tx, ctx, {
      action: "workspace.member_role_changed",
      targetType: "user",
      targetId: member.userId,
      metadata: { from: member.role, to: role },
    });
    return updated;
  });
}

export async function removeWorkspaceMember(ctx: WorkspaceContext, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspaceId } });
    if (!member) throw new NotFoundError("Member");
    if (member.userId !== ctx.userId) assertPermission(ctx, "workspace:members:manage");
    await tx.workspaceMember.delete({ where: { id: member.id } });
    await recordAudit(tx, ctx, { action: "workspace.member_removed", targetType: "user", targetId: member.userId, metadata: { role: member.role } });
  });
}

export async function listAuditLog(ctx: AgencyContext | WorkspaceContext, take = 100) {
  if (ctx.kind === "agency") assertPermission(ctx, "agency:audit:read");
  else assertPermission(ctx, "workspace:audit:read");
  return prisma.auditLog.findMany({
    where: ctx.kind === "agency" ? { agencyId: ctx.agencyId } : { workspaceId: ctx.workspaceId },
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ipAddress: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
      workspace: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 500),
  });
}
