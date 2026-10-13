import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import { assertPermission, isWorkspaceUser, type WorkspaceContext } from "../authz/context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { recordActivity } from "./activity";
import { recordAudit } from "./audit";
import { notifyUser } from "./notifications";
import { parseInput } from "./parse";
import { moveOpportunityInput, opportunityInput, type OpportunityInput } from "@/lib/validation/crm";

const detailInclude = {
  pipeline: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, probability: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OpportunityInclude;

export async function getOpportunity(ctx: WorkspaceContext, opportunityId: string) {
  assertPermission(ctx, "opportunities:read");
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, workspaceId: ctx.workspaceId },
    include: detailInclude,
  });
  if (!opportunity) throw new NotFoundError("Opportunity");
  return opportunity;
}

export async function listOpportunities(
  ctx: WorkspaceContext,
  filter: { pipelineId?: string; status?: "OPEN" | "WON" | "LOST"; contactId?: string; q?: string; take?: number } = {},
) {
  assertPermission(ctx, "opportunities:read");
  return prisma.opportunity.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      archivedAt: null,
      ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" } } : {}),
    },
    include: detailInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(filter.take ?? 200, 500),
  });
}

/** Verifies every referenced record belongs to the caller's workspace. */
async function validateReferences(db: Db, ctx: WorkspaceContext, input: OpportunityInput) {
  const stage = await db.pipelineStage.findFirst({
    where: { id: input.stageId, pipelineId: input.pipelineId, workspaceId: ctx.workspaceId },
    select: { id: true, name: true, pipeline: { select: { archivedAt: true } } },
  });
  if (!stage) throw new ValidationError("Choose a stage from the selected pipeline.", { stageId: ["Invalid stage"] });
  if (input.contactId) {
    const contact = await db.contact.count({ where: { id: input.contactId, workspaceId: ctx.workspaceId } });
    if (!contact) throw new ValidationError("Choose a contact from this workspace.", { contactId: ["Invalid contact"] });
  }
  if (input.assignedToId && !(await isWorkspaceUser(ctx, input.assignedToId, db))) {
    throw new ValidationError("The assigned user does not have access to this workspace.", { assignedToId: ["Invalid user"] });
  }
  return stage;
}

export async function createOpportunity(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "opportunities:write");
  const input = parseInput(opportunityInput, raw);
  return prisma.$transaction(async (tx) => {
    const stage = await validateReferences(tx, ctx, input);
    const opportunity = await tx.opportunity.create({
      data: {
        workspaceId: ctx.workspaceId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        contactId: input.contactId ?? null,
        name: input.name,
        valueCents: input.valueCents,
        status: input.status,
        expectedCloseDate: input.expectedCloseDate ?? null,
        assignedToId: input.assignedToId ?? null,
        source: input.source ?? null,
        createdById: ctx.userId,
        closedAt: input.status === "OPEN" ? null : new Date(),
      },
    });
    await recordActivity(tx, ctx, {
      type: "opportunity.created",
      opportunityId: opportunity.id,
      contactId: opportunity.contactId,
      metadata: { name: opportunity.name, stage: stage.name, valueCents: opportunity.valueCents },
    });
    if (opportunity.assignedToId && opportunity.assignedToId !== ctx.userId) {
      await notifyUser(tx, {
        userId: opportunity.assignedToId,
        workspaceId: ctx.workspaceId,
        type: "opportunity.assigned",
        title: `You were assigned the opportunity "${opportunity.name}"`,
        href: `/w/${ctx.workspaceId}/opportunities/${opportunity.id}`,
      });
    }
    return opportunity;
  });
}

export async function updateOpportunity(ctx: WorkspaceContext, opportunityId: string, raw: unknown) {
  assertPermission(ctx, "opportunities:write");
  const input = parseInput(opportunityInput, raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({
      where: { id: opportunityId, workspaceId: ctx.workspaceId },
      include: { stage: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundError("Opportunity");
    const stage = await validateReferences(tx, ctx, input);

    const stageChanged = existing.stageId !== input.stageId;
    const statusChanged = existing.status !== input.status;
    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        contactId: input.contactId ?? null,
        name: input.name,
        valueCents: input.valueCents,
        status: input.status,
        expectedCloseDate: input.expectedCloseDate ?? null,
        assignedToId: input.assignedToId ?? null,
        source: input.source ?? null,
        ...(stageChanged ? { stageChangedAt: new Date() } : {}),
        ...(statusChanged ? { closedAt: input.status === "OPEN" ? null : new Date() } : {}),
      },
    });

    if (stageChanged) {
      await recordActivity(tx, ctx, {
        type: "opportunity.stage_changed",
        opportunityId,
        contactId: updated.contactId,
        metadata: { name: updated.name, from: existing.stage.name, to: stage.name },
      });
    }
    if (statusChanged) {
      await recordActivity(tx, ctx, {
        type: "opportunity.status_changed",
        opportunityId,
        contactId: updated.contactId,
        metadata: { name: updated.name, from: existing.status, to: updated.status },
      });
    }
    const otherChanges = (["name", "valueCents", "contactId", "assignedToId", "source"] as const).filter(
      (f) => existing[f] !== updated[f],
    );
    if (existing.expectedCloseDate?.getTime() !== updated.expectedCloseDate?.getTime()) {
      (otherChanges as string[]).push("expectedCloseDate");
    }
    if (otherChanges.length > 0) {
      await recordActivity(tx, ctx, {
        type: "opportunity.updated",
        opportunityId,
        contactId: updated.contactId,
        metadata: { name: updated.name, fields: otherChanges },
      });
    }
    if (updated.assignedToId && updated.assignedToId !== existing.assignedToId && updated.assignedToId !== ctx.userId) {
      await notifyUser(tx, {
        userId: updated.assignedToId,
        workspaceId: ctx.workspaceId,
        type: "opportunity.assigned",
        title: `You were assigned the opportunity "${updated.name}"`,
        href: `/w/${ctx.workspaceId}/opportunities/${updated.id}`,
      });
    }
    return updated;
  });
}

/** Moves an opportunity to another stage of the same pipeline (Kanban drag-and-drop). */
export async function moveOpportunityStage(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "opportunities:write");
  const { opportunityId, stageId } = parseInput(moveOpportunityInput, raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({
      where: { id: opportunityId, workspaceId: ctx.workspaceId },
      include: { stage: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundError("Opportunity");
    if (existing.stageId === stageId) return existing;
    const stage = await tx.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: existing.pipelineId, workspaceId: ctx.workspaceId },
    });
    if (!stage) throw new ValidationError("That stage is not part of this pipeline.");

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: { stageId, stageChangedAt: new Date() },
    });
    await recordActivity(tx, ctx, {
      type: "opportunity.stage_changed",
      opportunityId,
      contactId: existing.contactId,
      metadata: { name: existing.name, from: existing.stage.name, to: stage.name },
    });
    return updated;
  });
}

export async function setOpportunityStatus(ctx: WorkspaceContext, opportunityId: string, status: "OPEN" | "WON" | "LOST") {
  assertPermission(ctx, "opportunities:write");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({ where: { id: opportunityId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Opportunity");
    if (existing.status === status) return existing;
    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: { status, closedAt: status === "OPEN" ? null : new Date() },
    });
    await recordActivity(tx, ctx, {
      type: "opportunity.status_changed",
      opportunityId,
      contactId: existing.contactId,
      metadata: { name: existing.name, from: existing.status, to: status },
    });
    return updated;
  });
}

export async function setOpportunityArchived(ctx: WorkspaceContext, opportunityId: string, archived: boolean) {
  assertPermission(ctx, "opportunities:write");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({ where: { id: opportunityId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Opportunity");
    const updated = await tx.opportunity.update({ where: { id: opportunityId }, data: { archivedAt: archived ? new Date() : null } });
    if (archived) {
      await recordActivity(tx, ctx, { type: "opportunity.archived", opportunityId, contactId: existing.contactId, metadata: { name: existing.name } });
    }
    return updated;
  });
}

export async function deleteOpportunity(ctx: WorkspaceContext, opportunityId: string) {
  assertPermission(ctx, "opportunities:delete");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({ where: { id: opportunityId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Opportunity");
    if (!existing.archivedAt) throw new ConflictError("Archive the opportunity before deleting it permanently.");
    await tx.opportunity.delete({ where: { id: opportunityId } });
    await recordAudit(tx, ctx, {
      action: "opportunity.deleted",
      targetType: "opportunity",
      targetId: opportunityId,
      metadata: { name: existing.name, valueCents: existing.valueCents },
    });
  });
}
