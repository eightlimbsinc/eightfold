import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import { assertPermission, can, isWorkspaceUser, type WorkspaceContext } from "../authz/context";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { recordActivity } from "./activity";
import { notifyUser } from "./notifications";
import { parseInput } from "./parse";
import { taskInput, type TaskInput, TASK_FILTERS } from "@/lib/validation/crm";

export type TaskFilter = (typeof TASK_FILTERS)[number];

const taskSelect = {
  id: true,
  title: true,
  description: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  createdById: true,
  assignee: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true } },
  opportunity: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

export type TaskItem = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

export async function listTasks(
  ctx: WorkspaceContext,
  opts: { filter?: TaskFilter; contactId?: string; opportunityId?: string; take?: number } = {},
): Promise<TaskItem[]> {
  assertPermission(ctx, "tasks:read");
  const filter = opts.filter ?? "open";
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(opts.contactId ? { contactId: opts.contactId } : {}),
    ...(opts.opportunityId ? { opportunityId: opts.opportunityId } : {}),
    ...(filter === "open" ? { completedAt: null } : {}),
    ...(filter === "mine" ? { completedAt: null, assigneeId: ctx.userId } : {}),
    ...(filter === "overdue" ? { completedAt: null, dueAt: { lt: now } } : {}),
    ...(filter === "completed" ? { completedAt: { not: null } } : {}),
  };
  return prisma.task.findMany({
    where,
    select: taskSelect,
    orderBy:
      filter === "completed"
        ? [{ completedAt: "desc" }]
        : [{ completedAt: { sort: "desc", nulls: "first" } }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: Math.min(opts.take ?? 100, 500),
  });
}

async function resolveReferences(db: Db, ctx: WorkspaceContext, input: TaskInput) {
  let contactId = input.contactId ?? null;
  if (input.opportunityId) {
    const opp = await db.opportunity.findFirst({
      where: { id: input.opportunityId, workspaceId: ctx.workspaceId },
      select: { contactId: true },
    });
    if (!opp) throw new ValidationError("Choose an opportunity from this workspace.", { opportunityId: ["Invalid opportunity"] });
    contactId = contactId ?? opp.contactId;
  }
  if (contactId) {
    const contact = await db.contact.count({ where: { id: contactId, workspaceId: ctx.workspaceId } });
    if (!contact) throw new ValidationError("Choose a contact from this workspace.", { contactId: ["Invalid contact"] });
  }
  if (input.assigneeId && !(await isWorkspaceUser(ctx, input.assigneeId, db))) {
    throw new ValidationError("The assignee does not have access to this workspace.", { assigneeId: ["Invalid user"] });
  }
  return { contactId, opportunityId: input.opportunityId ?? null };
}

export async function createTask(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "tasks:write");
  const input = parseInput(taskInput, raw);
  return prisma.$transaction(async (tx) => {
    const refs = await resolveReferences(tx, ctx, input);
    const task = await tx.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        assigneeId: input.assigneeId ?? null,
        ...refs,
        createdById: ctx.userId,
      },
    });
    await recordActivity(tx, ctx, {
      type: "task.created",
      contactId: task.contactId,
      opportunityId: task.opportunityId,
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title, dueAt: task.dueAt?.toISOString() ?? null },
    });
    if (task.assigneeId && task.assigneeId !== ctx.userId) {
      await notifyUser(tx, {
        userId: task.assigneeId,
        workspaceId: ctx.workspaceId,
        type: "task.assigned",
        title: `New task: ${task.title}`,
        href: `/w/${ctx.workspaceId}/tasks`,
      });
    }
    return task;
  });
}

export async function updateTask(ctx: WorkspaceContext, taskId: string, raw: unknown) {
  assertPermission(ctx, "tasks:write");
  const input = parseInput(taskInput, raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id: taskId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Task");
    const refs = await resolveReferences(tx, ctx, input);
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        assigneeId: input.assigneeId ?? null,
        ...refs,
      },
    });
    if (task.assigneeId && task.assigneeId !== existing.assigneeId && task.assigneeId !== ctx.userId) {
      await notifyUser(tx, {
        userId: task.assigneeId,
        workspaceId: ctx.workspaceId,
        type: "task.assigned",
        title: `Task assigned to you: ${task.title}`,
        href: `/w/${ctx.workspaceId}/tasks`,
      });
    }
    return task;
  });
}

export async function setTaskCompleted(ctx: WorkspaceContext, taskId: string, completed: boolean) {
  assertPermission(ctx, "tasks:write");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id: taskId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Task");
    if (!!existing.completedAt === completed) return existing;
    const task = await tx.task.update({
      where: { id: taskId },
      data: completed ? { completedAt: new Date(), completedById: ctx.userId } : { completedAt: null, completedById: null },
    });
    await recordActivity(tx, ctx, {
      type: completed ? "task.completed" : "task.reopened",
      contactId: task.contactId,
      opportunityId: task.opportunityId,
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title },
    });
    return task;
  });
}

export async function deleteTask(ctx: WorkspaceContext, taskId: string) {
  assertPermission(ctx, "tasks:write");
  const existing = await prisma.task.findFirst({ where: { id: taskId, workspaceId: ctx.workspaceId } });
  if (!existing) throw new NotFoundError("Task");
  if (existing.createdById !== ctx.userId && !can(ctx, "notes:delete_any")) {
    throw new ForbiddenError("Only the task's creator or a workspace admin can delete it.");
  }
  await prisma.task.delete({ where: { id: taskId } });
}
