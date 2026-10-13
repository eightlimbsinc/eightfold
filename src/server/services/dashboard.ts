import { prisma } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";
import { listActivities } from "./activity";

function endOfToday(now: Date) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Dashboard metrics, all computed from live records in the workspace. */
export async function getDashboard(ctx: WorkspaceContext, now: Date = new Date()) {
  assertPermission(ctx, "workspace:read");
  const ws = ctx.workspaceId;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalContacts,
    newContacts30d,
    recentContacts,
    openAgg,
    wonAgg,
    tasksDueCount,
    overdueCount,
    myTasks,
    stageBreakdown,
    activities,
  ] = await Promise.all([
    prisma.contact.count({ where: { workspaceId: ws, archivedAt: null } }),
    prisma.contact.count({ where: { workspaceId: ws, archivedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.contact.findMany({
      where: { workspaceId: ws, archivedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true, createdAt: true, lifecycleStatus: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.opportunity.aggregate({
      where: { workspaceId: ws, archivedAt: null, status: "OPEN" },
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.opportunity.aggregate({
      where: { workspaceId: ws, archivedAt: null, status: "WON", closedAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.task.count({ where: { workspaceId: ws, completedAt: null, dueAt: { lte: endOfToday(now) } } }),
    prisma.task.count({ where: { workspaceId: ws, completedAt: null, dueAt: { lt: now } } }),
    prisma.task.findMany({
      where: { workspaceId: ws, completedAt: null, assigneeId: ctx.userId },
      select: {
        id: true,
        title: true,
        dueAt: true,
        contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true } },
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6,
    }),
    prisma.opportunity.groupBy({
      by: ["pipelineId"],
      where: { workspaceId: ws, archivedAt: null, status: "OPEN" },
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    listActivities(ctx, { take: 12 }),
  ]);

  const pipelineNames = await prisma.pipeline.findMany({
    where: { workspaceId: ws, id: { in: stageBreakdown.map((s) => s.pipelineId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(pipelineNames.map((p) => [p.id, p.name]));

  return {
    totalContacts,
    newContacts30d,
    recentContacts,
    openOpportunities: openAgg._count._all,
    pipelineValueCents: openAgg._sum.valueCents ?? 0,
    wonThisMonth: { count: wonAgg._count._all, valueCents: wonAgg._sum.valueCents ?? 0 },
    tasksDue: tasksDueCount,
    tasksOverdue: overdueCount,
    myTasks,
    pipelines: stageBreakdown
      .map((s) => ({ id: s.pipelineId, name: nameById.get(s.pipelineId) ?? "Pipeline", count: s._count._all, valueCents: s._sum.valueCents ?? 0 }))
      .sort((a, b) => b.valueCents - a.valueCents),
    activities,
  };
}
