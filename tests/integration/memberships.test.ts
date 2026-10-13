import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { loadWorkspaceContext } from "@/server/authz/context";
import { acceptInvitation, createInvitation, getInvitationByToken, revokeInvitation } from "@/server/services/invitations";
import {
  createWorkspace,
  removeAgencyMember,
  updateAgencyMemberRole,
  updateWorkspaceMemberRole,
  updateWorkspaceSettings,
} from "@/server/services/tenancy";
import { createFieldDefinition } from "@/server/services/custom-fields";
import { addWorkspaceMember, agencyCtx, createAgencyOwner, createUser } from "../support/factories";

function tokenFrom(url: string) {
  return url.split("/invite/")[1];
}

describe("onboarding and workspaces", () => {
  it("creates agency, owner membership, workspace and audit entries atomically", async () => {
    const { user, agency, workspace } = await createAgencyOwner("Eight");
    expect(agency.slug).toBe("eight-agency");
    const membership = await prisma.agencyMember.findFirstOrThrow({ where: { userId: user.id } });
    expect(membership.role).toBe("OWNER");
    expect(workspace.agencyId).toBe(agency.id);
    expect(await prisma.auditLog.count({ where: { action: "agency.created" } })).toBe(1);
  });

  it("generates unique agency slugs for identical names", async () => {
    const a = await createAgencyOwner("Same");
    const b = await createAgencyOwner("Same");
    expect(a.agency.slug).not.toBe(b.agency.slug);
  });

  it("lets agency admins create workspaces but not workspace admins", async () => {
    const owner = await createAgencyOwner();
    const ws = await createWorkspace(owner.agencyCtx, { name: "Second client", timezone: "America/Chicago", currency: "CAD" });
    expect(ws.currency).toBe("CAD");
    const wsAdmin = await addWorkspaceMember(owner.workspace.id, "ADMIN");
    // Workspace admins have no agency context at all.
    await expect(agencyCtx(wsAdmin.user.id, owner.agency.id)).rejects.toThrow();
  });
});

describe("role enforcement", () => {
  it("workspace members cannot change settings or manage custom fields", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    await expect(
      updateWorkspaceSettings(member.ctx, { name: "x", timezone: "UTC", currency: "USD", duplicatePolicy: "NONE" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createFieldDefinition(member.ctx, { label: "X", type: "TEXT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = await addWorkspaceMember(owner.workspace.id, "ADMIN", "Admin");
    await expect(createFieldDefinition(admin.ctx, { label: "X", type: "TEXT" })).resolves.toBeTruthy();
  });

  it("only owners grant ownership, and the last owner cannot be removed", async () => {
    const owner = await createAgencyOwner();
    const adminUser = await createUser("Agency Admin");
    const adminMember = await prisma.agencyMember.create({ data: { agencyId: owner.agency.id, userId: adminUser.id, role: "ADMIN" } });
    const admin = await agencyCtx(adminUser.id, owner.agency.id);
    const ownerMember = await prisma.agencyMember.findFirstOrThrow({ where: { userId: owner.user.id } });

    await expect(updateAgencyMemberRole(admin, adminMember.id, "OWNER")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeAgencyMember(admin, ownerMember.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeAgencyMember(owner.agencyCtx, ownerMember.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateAgencyMemberRole(owner.agencyCtx, ownerMember.id, "ADMIN")).rejects.toMatchObject({ code: "CONFLICT" });

    await updateAgencyMemberRole(owner.agencyCtx, adminMember.id, "OWNER");
    await updateAgencyMemberRole(owner.agencyCtx, ownerMember.id, "ADMIN");
    expect(await prisma.auditLog.count({ where: { action: "agency.member_role_changed" } })).toBe(2);
  });

  it("workspace admins manage members of their own workspace only", async () => {
    const owner = await createAgencyOwner();
    const admin = await addWorkspaceMember(owner.workspace.id, "ADMIN", "Admin");
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER", "Member");
    const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: member.user.id } });
    await updateWorkspaceMemberRole(admin.ctx, membership.id, "ADMIN");
    expect((await loadWorkspaceContext(member.user.id, owner.workspace.id))?.role).toBe("WORKSPACE_ADMIN");
    // Contexts are resolved per request: the stale MEMBER context is still denied...
    await expect(updateWorkspaceMemberRole(member.ctx, membership.id, "MEMBER")).rejects.toMatchObject({ code: "FORBIDDEN" });
    // ...while a freshly loaded context reflects the promotion.
    const promoted = await loadWorkspaceContext(member.user.id, owner.workspace.id);
    await expect(updateWorkspaceMemberRole(promoted!, membership.id, "MEMBER")).resolves.toBeTruthy();
  });
});

describe("invitations", () => {
  it("invites a user to a workspace and grants access on acceptance", async () => {
    const owner = await createAgencyOwner();
    const { url, invitation } = await createInvitation(owner.ctx, { email: "New.Hire@Example.com", role: "WORKSPACE_MEMBER" });
    expect(invitation.email).toBe("new.hire@example.com");
    expect(invitation.tokenHash).not.toContain(tokenFrom(url)); // only the hash is stored

    const invitee = await createUser("New Hire", "new.hire@example.com");
    expect((await getInvitationByToken(tokenFrom(url))).status).toBe("valid");
    const result = await acceptInvitation(invitee, tokenFrom(url));
    expect(result.workspaceId).toBe(owner.workspace.id);
    expect((await loadWorkspaceContext(invitee.id, owner.workspace.id))?.role).toBe("WORKSPACE_MEMBER");

    // Tokens are single-use.
    await expect(acceptInvitation(invitee, tokenFrom(url))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses acceptance by a different email address", async () => {
    const owner = await createAgencyOwner();
    const { url } = await createInvitation(owner.agencyCtx, { email: "partner@example.com", role: "AGENCY_ADMIN" });
    const attacker = await createUser("Attacker", "attacker@example.com");
    await expect(acceptInvitation(attacker, tokenFrom(url))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.agencyMember.count({ where: { userId: attacker.id } })).toBe(0);
  });

  it("enforces who may invite which role", async () => {
    const owner = await createAgencyOwner();
    const wsAdmin = await addWorkspaceMember(owner.workspace.id, "ADMIN", "WS Admin");
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    await expect(createInvitation(member.ctx, { email: "x@example.com", role: "WORKSPACE_MEMBER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvitation(wsAdmin.ctx, { email: "x@example.com", role: "AGENCY_ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvitation(wsAdmin.ctx, { email: "x@example.com", role: "WORKSPACE_ADMIN" })).resolves.toBeTruthy();

    const adminUser = await createUser("Agency Admin");
    await prisma.agencyMember.create({ data: { agencyId: owner.agency.id, userId: adminUser.id, role: "ADMIN" } });
    const admin = await agencyCtx(adminUser.id, owner.agency.id);
    await expect(createInvitation(admin, { email: "boss@example.com", role: "AGENCY_OWNER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects revoked and expired invitations", async () => {
    const owner = await createAgencyOwner();
    const invitee = await createUser("Late", "late@example.com");
    const first = await createInvitation(owner.ctx, { email: "late@example.com", role: "WORKSPACE_MEMBER" });
    await revokeInvitation(owner.ctx, first.invitation.id);
    await expect(acceptInvitation(invitee, tokenFrom(first.url))).rejects.toMatchObject({ code: "NOT_FOUND" });

    const second = await createInvitation(owner.ctx, { email: "late@example.com", role: "WORKSPACE_MEMBER" });
    await prisma.invitation.update({ where: { id: second.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getInvitationByToken(tokenFrom(second.url))).status).toBe("expired");
    await expect(acceptInvitation(invitee, tokenFrom(second.url))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not let an invitation for agency B be created from agency A's workspace id", async () => {
    const a = await createAgencyOwner("A");
    const b = await createAgencyOwner("B");
    await expect(
      createInvitation(a.agencyCtx, { email: "x@example.com", role: "WORKSPACE_MEMBER", workspaceId: b.workspace.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
