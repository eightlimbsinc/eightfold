import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";

/**
 * Activity types. Future modules (email, SMS, workflows, appointments) extend
 * this list; the column is a string so no migration is needed.
 */
export const ACTIVITY_TYPES = [
  "contact.created",
  "contact.updated",
  "contact.archived",
  "contact.restored",
  "contact.tag_added",
  "contact.tag_removed",
  "opportunity.created",
  "opportunity.updated",
  "opportunity.stage_changed",
  "opportunity.status_changed",
  "opportunity.archived",
  "task.created",
  "task.completed",
  "task.reopened",
  "note.created",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityInput {
  type: ActivityType;
  contactId?: string | null;
  opportunityId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function recordActivity(db: Db, ctx: WorkspaceContext, input: ActivityInput) {
  await db.activity.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      type: input.type,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    },
  });
}

const activitySelect = {
  id: true,
  type: true,
  metadata: true,
  createdAt: true,
  contactId: true,
  opportunityId: true,
  actor: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true } },
  opportunity: { select: { id: true, name: true } },
} satisfies Prisma.ActivitySelect;

export type ActivityItem = Prisma.ActivityGetPayload<{ select: typeof activitySelect }>;

export async function listActivities(
  ctx: WorkspaceContext,
  filter: { contactId?: string; opportunityId?: string; take?: number } = {},
): Promise<ActivityItem[]> {
  assertPermission(ctx, "workspace:read");
  return prisma.activity.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
    },
    select: activitySelect,
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 50, 200),
  });
}
