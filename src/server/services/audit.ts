import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "../db";
import type { AgencyContext, WorkspaceContext } from "../authz/context";

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  agencyId?: string | null;
  workspaceId?: string | null;
}

/** Appends an audit-log row for security-sensitive or administrative actions. */
export async function recordAudit(db: Db, ctx: WorkspaceContext | AgencyContext | { userId: string }, entry: AuditEntry) {
  const scoped =
    "kind" in ctx
      ? ctx.kind === "workspace"
        ? { agencyId: ctx.agencyId, workspaceId: ctx.workspaceId }
        : { agencyId: ctx.agencyId, workspaceId: null }
      : { agencyId: null, workspaceId: null };
  const request = "request" in ctx ? ctx.request : undefined;
  await db.auditLog.create({
    data: {
      agencyId: entry.agencyId !== undefined ? entry.agencyId : scoped.agencyId,
      workspaceId: entry.workspaceId !== undefined ? entry.workspaceId : scoped.workspaceId,
      actorId: ctx.userId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      ipAddress: request?.ipAddress ?? null,
      userAgent: request?.userAgent?.slice(0, 300) ?? null,
    },
  });
}
