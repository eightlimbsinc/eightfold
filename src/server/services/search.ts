import { prisma } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";
import { searchContactOptions } from "./contacts";

/** Workspace-scoped global search across contacts, opportunities, and tasks. */
export async function globalSearch(ctx: WorkspaceContext, rawQuery: string) {
  assertPermission(ctx, "workspace:read");
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < 2) return { contacts: [], opportunities: [], tasks: [] };
  const [contacts, opportunities, tasks] = await Promise.all([
    searchContactOptions(ctx, q, 6),
    prisma.opportunity.findMany({
      where: { workspaceId: ctx.workspaceId, archivedAt: null, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, valueCents: true, status: true, stage: { select: { name: true } } },
      take: 6,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { workspaceId: ctx.workspaceId, title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, completedAt: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { contacts, opportunities, tasks };
}

export type SearchResults = Awaited<ReturnType<typeof globalSearch>>;
