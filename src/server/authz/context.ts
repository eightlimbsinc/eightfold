/**
 * Tenant-scoped authorization contexts. Every service function receives a
 * context produced here, so permission checks and tenant scoping happen on the
 * server for every protected operation — independent of what the UI shows.
 */
import { prisma, type Db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import {
  agencyRoleToRole,
  hasPermission,
  highestRole,
  isAgencyRole,
  workspaceRoleToRole,
  type Permission,
  type Role,
} from "@/lib/permissions";

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WorkspaceContext {
  kind: "workspace";
  userId: string;
  workspaceId: string;
  agencyId: string;
  role: Role;
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    duplicatePolicy: "NONE" | "EMAIL" | "EMAIL_OR_PHONE";
    archivedAt: Date | null;
    agencyName: string;
  };
  request?: RequestMeta;
}

export interface AgencyContext {
  kind: "agency";
  userId: string;
  agencyId: string;
  role: Role;
  agency: { id: string; name: string; slug: string };
  request?: RequestMeta;
}

/**
 * Resolves the caller's effective role in a workspace. Returns null when the
 * user has no access (including when the workspace does not exist), so callers
 * cannot distinguish "forbidden" from "missing" and tenant data is not leaked.
 */
export async function loadWorkspaceContext(
  userId: string,
  workspaceId: string,
  db: Db = prisma,
): Promise<WorkspaceContext | null> {
  if (!userId || !workspaceId) return null;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      currency: true,
      duplicatePolicy: true,
      archivedAt: true,
      agencyId: true,
      agency: { select: { name: true, members: { where: { userId }, select: { role: true } } } },
      members: { where: { userId }, select: { role: true } },
    },
  });
  if (!workspace) return null;

  const role = highestRole([
    workspace.agency.members[0] ? agencyRoleToRole(workspace.agency.members[0].role) : null,
    workspace.members[0] ? workspaceRoleToRole(workspace.members[0].role) : null,
  ]);
  if (!role) return null;
  // Archived workspaces are only visible to agency-level administrators.
  if (workspace.archivedAt && !isAgencyRole(role)) return null;

  return {
    kind: "workspace",
    userId,
    workspaceId: workspace.id,
    agencyId: workspace.agencyId,
    role,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      timezone: workspace.timezone,
      currency: workspace.currency,
      duplicatePolicy: workspace.duplicatePolicy,
      archivedAt: workspace.archivedAt,
      agencyName: workspace.agency.name,
    },
  };
}

/** Resolves agency-level access. Workspace-only users have no agency context. */
export async function loadAgencyContext(userId: string, agencyId: string, db: Db = prisma): Promise<AgencyContext | null> {
  if (!userId || !agencyId) return null;
  const membership = await db.agencyMember.findUnique({
    where: { agencyId_userId: { agencyId, userId } },
    select: { role: true, agency: { select: { id: true, name: true, slug: true } } },
  });
  if (!membership) return null;
  return { kind: "agency", userId, agencyId, role: agencyRoleToRole(membership.role), agency: membership.agency };
}

export async function requireWorkspaceContextFor(userId: string, workspaceId: string, db: Db = prisma) {
  const ctx = await loadWorkspaceContext(userId, workspaceId, db);
  if (!ctx) throw new NotFoundError("Workspace");
  return ctx;
}

export async function requireAgencyContextFor(userId: string, agencyId: string, db: Db = prisma) {
  const ctx = await loadAgencyContext(userId, agencyId, db);
  if (!ctx) throw new NotFoundError("Agency");
  return ctx;
}

export function can(ctx: { role: Role }, permission: Permission): boolean {
  return hasPermission(ctx.role, permission);
}

export function assertPermission(ctx: { role: Role }, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) throw new ForbiddenError();
}

/** Workspaces the user can open, grouped with their agency, for the switcher. */
export async function listAccessibleWorkspaces(userId: string, db: Db = prisma) {
  const [agencyMemberships, workspaceMemberships] = await Promise.all([
    db.agencyMember.findMany({
      where: { userId },
      select: {
        role: true,
        agency: {
          select: {
            id: true,
            name: true,
            workspaces: {
              where: { archivedAt: null },
              select: { id: true, name: true, agencyId: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    }),
    db.workspaceMember.findMany({
      where: { userId, workspace: { archivedAt: null } },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, agencyId: true, agency: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  type Entry = { agencyId: string; agencyName: string; agencyRole: Role | null; workspaces: Map<string, { id: string; name: string; role: Role }> };
  const byAgency = new Map<string, Entry>();

  for (const m of agencyMemberships) {
    const role = agencyRoleToRole(m.role);
    const entry: Entry = { agencyId: m.agency.id, agencyName: m.agency.name, agencyRole: role, workspaces: new Map() };
    for (const w of m.agency.workspaces) entry.workspaces.set(w.id, { id: w.id, name: w.name, role });
    byAgency.set(m.agency.id, entry);
  }
  for (const m of workspaceMemberships) {
    const role = workspaceRoleToRole(m.role);
    let entry = byAgency.get(m.workspace.agencyId);
    if (!entry) {
      entry = { agencyId: m.workspace.agency.id, agencyName: m.workspace.agency.name, agencyRole: null, workspaces: new Map() };
      byAgency.set(entry.agencyId, entry);
    }
    if (!entry.workspaces.has(m.workspace.id)) {
      entry.workspaces.set(m.workspace.id, { id: m.workspace.id, name: m.workspace.name, role });
    }
  }

  return [...byAgency.values()]
    .map((e) => ({
      agencyId: e.agencyId,
      agencyName: e.agencyName,
      agencyRole: e.agencyRole,
      workspaces: [...e.workspaces.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.agencyName.localeCompare(b.agencyName));
}

export type AccessibleWorkspaces = Awaited<ReturnType<typeof listAccessibleWorkspaces>>;

/** Users who can access a workspace (agency admins + explicit members), for assignee pickers. */
export async function listWorkspaceUsers(ctx: WorkspaceContext, db: Db = prisma) {
  const users = await db.user.findMany({
    where: {
      OR: [
        { workspaceMemberships: { some: { workspaceId: ctx.workspaceId } } },
        { agencyMemberships: { some: { agencyId: ctx.agencyId } } },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
}

/** True when `userId` may be assigned work in the context's workspace. */
export async function isWorkspaceUser(ctx: WorkspaceContext, userId: string, db: Db = prisma): Promise<boolean> {
  const count = await db.user.count({
    where: {
      id: userId,
      OR: [
        { workspaceMemberships: { some: { workspaceId: ctx.workspaceId } } },
        { agencyMemberships: { some: { agencyId: ctx.agencyId } } },
      ],
    },
  });
  return count > 0;
}
