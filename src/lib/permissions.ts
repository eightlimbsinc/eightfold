/**
 * Role and permission model. Pure and dependency-free so it can be shared by
 * the server (enforcement) and the UI (hiding controls). The UI must never be
 * the only gate: every service function calls `assertPermission`.
 */

export const ROLES = ["AGENCY_OWNER", "AGENCY_ADMIN", "WORKSPACE_ADMIN", "WORKSPACE_MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  AGENCY_OWNER: "Agency Owner",
  AGENCY_ADMIN: "Agency Admin",
  WORKSPACE_ADMIN: "Workspace Admin",
  WORKSPACE_MEMBER: "Workspace Member",
};

/** Higher number = more privileged. Used to resolve the effective role. */
export const ROLE_RANK: Record<Role, number> = {
  AGENCY_OWNER: 4,
  AGENCY_ADMIN: 3,
  WORKSPACE_ADMIN: 2,
  WORKSPACE_MEMBER: 1,
};

export const PERMISSIONS = [
  // Agency scope
  "agency:read",
  "agency:update",
  "agency:members:manage",
  "agency:owners:manage",
  "agency:audit:read",
  "workspace:create",
  "workspace:archive",
  // Workspace scope
  "workspace:read",
  "workspace:update",
  "workspace:members:manage",
  "workspace:audit:read",
  "contacts:read",
  "contacts:write",
  "contacts:archive",
  "contacts:delete",
  "custom_fields:manage",
  "tags:manage",
  "tags:assign",
  "pipelines:read",
  "pipelines:manage",
  "opportunities:read",
  "opportunities:write",
  "opportunities:delete",
  "tasks:read",
  "tasks:write",
  "notes:write",
  "notes:delete_any",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MEMBER: Permission[] = [
  "workspace:read",
  "contacts:read",
  "contacts:write",
  "contacts:archive",
  "tags:assign",
  "pipelines:read",
  "opportunities:read",
  "opportunities:write",
  "tasks:read",
  "tasks:write",
  "notes:write",
];

const WORKSPACE_ADMIN: Permission[] = [
  ...MEMBER,
  "workspace:update",
  "workspace:members:manage",
  "workspace:audit:read",
  "contacts:delete",
  "custom_fields:manage",
  "tags:manage",
  "pipelines:manage",
  "opportunities:delete",
  "notes:delete_any",
];

const AGENCY_ADMIN: Permission[] = [
  ...WORKSPACE_ADMIN,
  "agency:read",
  "agency:update",
  "agency:members:manage",
  "agency:audit:read",
  "workspace:create",
  "workspace:archive",
];

const AGENCY_OWNER: Permission[] = [...AGENCY_ADMIN, "agency:owners:manage"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  AGENCY_OWNER: new Set(AGENCY_OWNER),
  AGENCY_ADMIN: new Set(AGENCY_ADMIN),
  WORKSPACE_ADMIN: new Set(WORKSPACE_ADMIN),
  WORKSPACE_MEMBER: new Set(MEMBER),
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function isAgencyRole(role: Role): role is "AGENCY_OWNER" | "AGENCY_ADMIN" {
  return role === "AGENCY_OWNER" || role === "AGENCY_ADMIN";
}

/** Picks the most privileged role from a list (e.g. agency + workspace memberships). */
export function highestRole(roles: Array<Role | null | undefined>): Role | null {
  let best: Role | null = null;
  for (const role of roles) {
    if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

/**
 * Whether an actor with `actorRole` may grant or revoke `targetRole`.
 * Only owners manage owners; admins manage roles strictly below their own
 * agency-level standing; workspace admins manage workspace roles.
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === "AGENCY_OWNER") return actorRole === "AGENCY_OWNER";
  if (targetRole === "AGENCY_ADMIN") return hasPermission(actorRole, "agency:members:manage");
  return hasPermission(actorRole, "workspace:members:manage");
}

export function agencyRoleToRole(role: "OWNER" | "ADMIN"): Role {
  return role === "OWNER" ? "AGENCY_OWNER" : "AGENCY_ADMIN";
}

export function workspaceRoleToRole(role: "ADMIN" | "MEMBER"): Role {
  return role === "ADMIN" ? "WORKSPACE_ADMIN" : "WORKSPACE_MEMBER";
}
