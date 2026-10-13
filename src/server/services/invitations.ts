/**
 * Invitations grant agency- or workspace-level access. Only a SHA-256 hash of
 * the random token is stored; the raw token is returned once so the inviter can
 * share the link (and it is "sent" through the configured email adapter).
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import { assertPermission, type AgencyContext, type RequestMeta, type WorkspaceContext } from "../authz/context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { recordAudit } from "./audit";
import { sendEmail } from "../email";
import { canAssignRole, ROLE_LABELS, type Role } from "@/lib/permissions";
import { normalizeEmail } from "@/lib/normalize";
import { invitationInput } from "@/lib/validation/tenancy";
import { parseInput } from "./parse";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Creates an invitation. Agency contexts may invite to any role (subject to
 * role-assignment rules) and any workspace in the agency; workspace contexts
 * may only invite workspace-level roles to their own workspace.
 */
export async function createInvitation(ctx: AgencyContext | WorkspaceContext, raw: unknown) {
  const input = parseInput(invitationInput, ctx.kind === "workspace" ? { ...(raw as object), workspaceId: ctx.workspaceId } : raw);
  const role = input.role as Role;

  if (ctx.kind === "agency") {
    assertPermission(ctx, role.startsWith("AGENCY_") ? "agency:members:manage" : "workspace:members:manage");
  } else {
    assertPermission(ctx, "workspace:members:manage");
    if (role.startsWith("AGENCY_")) throw new ForbiddenError("Agency roles can only be granted from agency settings.");
  }
  if (!canAssignRole(ctx.role, role)) throw new ForbiddenError(`You cannot grant the ${ROLE_LABELS[role]} role.`);

  const email = normalizeEmail(input.email)!;
  const workspaceId = role.startsWith("WORKSPACE_") ? input.workspaceId! : null;

  if (workspaceId) {
    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, agencyId: ctx.agencyId, archivedAt: null } });
    if (!workspace) throw new ValidationError("Choose a workspace in this agency.", { workspaceId: ["Invalid workspace"] });
  }

  // Refuse to invite someone who already has the same or broader access.
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const agencyMember = await prisma.agencyMember.findUnique({
      where: { agencyId_userId: { agencyId: ctx.agencyId, userId: existingUser.id } },
    });
    if (agencyMember) throw new ConflictError("That person already has agency-wide access.");
    if (workspaceId) {
      const workspaceMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (workspaceMember) throw new ConflictError("That person is already a member of this workspace.");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const agencyName = ctx.kind === "agency" ? ctx.agency.name : ctx.workspace.agencyName;

  const invitation = await prisma.$transaction(async (tx) => {
    // Supersede any pending invitation for the same person and scope.
    await tx.invitation.updateMany({
      where: { agencyId: ctx.agencyId, email, workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.invitation.create({
      data: {
        agencyId: ctx.agencyId,
        workspaceId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await recordAudit(tx, ctx, {
      action: "invitation.created",
      workspaceId: workspaceId,
      targetType: "invitation",
      targetId: created.id,
      metadata: { email, role },
    });
    return created;
  });

  const url = `${appUrl()}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: `You've been invited to ${agencyName} on Eightfold`,
    text: `You've been invited to join ${agencyName} on Eightfold as ${ROLE_LABELS[role]}.\n\nAccept the invitation (valid for 7 days):\n${url}`,
  });
  return { invitation, url };
}

export async function listPendingInvitations(ctx: AgencyContext | WorkspaceContext) {
  if (ctx.kind === "agency") assertPermission(ctx, "agency:read");
  else assertPermission(ctx, "workspace:members:manage");
  return prisma.invitation.findMany({
    where: {
      agencyId: ctx.agencyId,
      ...(ctx.kind === "workspace" ? { workspaceId: ctx.workspaceId } : {}),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInvitation(ctx: AgencyContext | WorkspaceContext, invitationId: string) {
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      agencyId: ctx.agencyId,
      ...(ctx.kind === "workspace" ? { workspaceId: ctx.workspaceId } : {}),
    },
  });
  if (!invitation) throw new NotFoundError("Invitation");
  if (!canAssignRole(ctx.role, invitation.role as Role)) throw new ForbiddenError();
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await recordAudit(tx, ctx, { action: "invitation.revoked", workspaceId: invitation.workspaceId, targetType: "invitation", targetId: invitation.id, metadata: { email: invitation.email } });
  });
}

export type InvitationStatus = "valid" | "expired" | "revoked" | "accepted" | "not_found";

/** Public lookup used by the invite landing page. Reveals minimal information. */
export async function getInvitationByToken(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      agency: { select: { name: true } },
      workspace: { select: { name: true } },
    },
  });
  if (!invitation) return { status: "not_found" as const, invitation: null };
  const status: InvitationStatus = invitation.revokedAt
    ? "revoked"
    : invitation.acceptedAt
      ? "accepted"
      : invitation.expiresAt < new Date()
        ? "expired"
        : "valid";
  return { status, invitation };
}

/**
 * Accepts an invitation for the signed-in user. The user's email must match
 * the invited address, so a leaked link cannot be redeemed by someone else.
 */
export async function acceptInvitation(user: { id: string; email: string }, token: string, request?: RequestMeta) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation || invitation.revokedAt) throw new NotFoundError("Invitation");
    if (invitation.acceptedAt) throw new ConflictError("This invitation has already been used.");
    if (invitation.expiresAt < new Date()) throw new ConflictError("This invitation has expired. Ask for a new one.");
    if (normalizeEmail(user.email) !== invitation.email) {
      throw new ForbiddenError(`This invitation was sent to ${invitation.email}. Sign in with that email address to accept it.`);
    }

    // Atomically claim the invitation so concurrent accepts cannot both succeed.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    if (claimed.count !== 1) throw new ConflictError("This invitation has already been used.");

    if (invitation.role === "AGENCY_OWNER" || invitation.role === "AGENCY_ADMIN") {
      const role = invitation.role === "AGENCY_OWNER" ? "OWNER" : "ADMIN";
      const existing = await tx.agencyMember.findUnique({ where: { agencyId_userId: { agencyId: invitation.agencyId, userId: user.id } } });
      if (!existing) {
        await tx.agencyMember.create({ data: { agencyId: invitation.agencyId, userId: user.id, role } });
      } else if (existing.role === "ADMIN" && role === "OWNER") {
        await tx.agencyMember.update({ where: { id: existing.id }, data: { role } });
      }
    } else {
      const role = invitation.role === "WORKSPACE_ADMIN" ? "ADMIN" : "MEMBER";
      const existing = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId!, userId: user.id } },
      });
      if (!existing) {
        await tx.workspaceMember.create({ data: { workspaceId: invitation.workspaceId!, userId: user.id, role } });
      } else if (existing.role === "MEMBER" && role === "ADMIN") {
        await tx.workspaceMember.update({ where: { id: existing.id }, data: { role } });
      }
    }

    await recordAudit(tx, { userId: user.id, request } as { userId: string }, {
      action: "invitation.accepted",
      agencyId: invitation.agencyId,
      workspaceId: invitation.workspaceId,
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { role: invitation.role },
    });

    const workspaceId =
      invitation.workspaceId ??
      (await tx.workspace.findFirst({ where: { agencyId: invitation.agencyId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ??
      null;
    return { agencyId: invitation.agencyId, workspaceId };
  });
}
