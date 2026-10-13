/**
 * Cross-tenant access attempts. A user from agency A must not be able to read
 * or modify anything in agency B, even with valid ids for B's records.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { loadAgencyContext, loadWorkspaceContext } from "@/server/authz/context";
import { createContact, getContact, listContacts, updateContact, addTagToContact } from "@/server/services/contacts";
import { createOpportunity, getOpportunity, moveOpportunityStage } from "@/server/services/opportunities";
import { createTask } from "@/server/services/tasks";
import { createNote } from "@/server/services/notes";
import { createTag } from "@/server/services/tags";
import { updatePipeline } from "@/server/services/pipelines";
import { removeWorkspaceMember, setWorkspaceArchived } from "@/server/services/tenancy";
import { createAgencyOwner, addWorkspaceMember, defaultPipeline } from "../support/factories";

async function twoTenants() {
  const a = await createAgencyOwner("Alpha");
  const b = await createAgencyOwner("Bravo");
  const bPipeline = await defaultPipeline(b.workspace.id);
  const bContact = await createContact(b.ctx, { firstName: "Secret", email: "secret@bravo.test" });
  const bOpp = await createOpportunity(b.ctx, {
    name: "Bravo deal",
    pipelineId: bPipeline.id,
    stageId: bPipeline.stages[0].id,
    contactId: bContact.id,
    valueCents: "5000",
  });
  const bTag = await createTag(b.ctx, { name: "VIP" });
  return { a, b, bPipeline, bContact, bOpp, bTag };
}

describe("tenant isolation", () => {
  it("denies workspace and agency contexts across agencies", async () => {
    const { a, b } = await twoTenants();
    expect(await loadWorkspaceContext(a.user.id, b.workspace.id)).toBeNull();
    expect(await loadAgencyContext(a.user.id, b.agency.id)).toBeNull();
  });

  it("does not leak records by id across workspaces", async () => {
    const { a, bContact, bOpp } = await twoTenants();
    await expect(getContact(a.ctx, bContact.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getOpportunity(a.ctx, bOpp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const list = await listContacts(a.ctx, { q: "Secret" });
    expect(list.total).toBe(0);
  });

  it("rejects writes to another tenant's records", async () => {
    const { a, bContact, bOpp, bPipeline, bTag } = await twoTenants();
    await expect(updateContact(a.ctx, bContact.id, { firstName: "Hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moveOpportunityStage(a.ctx, { opportunityId: bOpp.id, stageId: bPipeline.stages[1].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePipeline(a.ctx, bPipeline.id, { name: "Hacked", stages: [{ name: "X" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addTagToContact(a.ctx, bContact.id, { tagId: bTag.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const unchanged = await prisma.contact.findUniqueOrThrow({ where: { id: bContact.id } });
    expect(unchanged.firstName).toBe("Secret");
  });

  it("rejects links from own records to another tenant's records", async () => {
    const { a, b, bContact, bOpp, bPipeline, bTag } = await twoTenants();
    const aPipeline = await defaultPipeline(a.workspace.id);

    // Opportunity in A pointing at B's contact or B's stage
    await expect(
      createOpportunity(a.ctx, { name: "x", pipelineId: aPipeline.id, stageId: aPipeline.stages[0].id, contactId: bContact.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createOpportunity(a.ctx, { name: "x", pipelineId: bPipeline.id, stageId: bPipeline.stages[0].id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Task / note in A pointing at B's records
    await expect(createTask(a.ctx, { title: "t", contactId: bContact.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createTask(a.ctx, { title: "t", opportunityId: bOpp.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createNote(a.ctx, { body: "n", contactId: bContact.id })).rejects.toMatchObject({ code: "VALIDATION" });

    // Contact in A tagged with B's tag, or assigned to B's owner
    await expect(createContact(a.ctx, { firstName: "x", tagIds: [bTag.id] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createContact(a.ctx, { firstName: "x", assignedToId: b.user.id })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enforces workspace boundaries via composite foreign keys at the database level", async () => {
    const { a, bTag } = await twoTenants();
    const aContact = await createContact(a.ctx, { firstName: "Mine" });
    // Bypass the service layer entirely: the database must still refuse.
    await expect(
      prisma.contactTag.create({ data: { contactId: aContact.id, tagId: bTag.id, workspaceId: a.workspace.id } }),
    ).rejects.toThrow();
  });

  it("prevents agency admins from managing other agencies' workspaces", async () => {
    const { a, b } = await twoTenants();
    await expect(setWorkspaceArchived(a.agencyCtx, b.workspace.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const member = await addWorkspaceMember(b.workspace.id, "MEMBER");
    const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: member.user.id } });
    await expect(removeWorkspaceMember(a.ctx, membership.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cross-workspace isolation within one agency", () => {
  it("workspace members only see workspaces granted to them", async () => {
    const owner = await createAgencyOwner("Agency");
    const second = await prisma.workspace.create({ data: { agencyId: owner.agency.id, name: "Other client", slug: "other" } });
    const { user, ctx } = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    expect(ctx.role).toBe("WORKSPACE_MEMBER");
    expect(await loadWorkspaceContext(user.id, second.id)).toBeNull();
    // ...whereas the agency owner can access every workspace in the agency.
    expect((await loadWorkspaceContext(owner.user.id, second.id))?.role).toBe("AGENCY_OWNER");
  });

  it("hides archived workspaces from non-agency members", async () => {
    const owner = await createAgencyOwner("Agency");
    const { user } = await addWorkspaceMember(owner.workspace.id, "ADMIN");
    await setWorkspaceArchived(owner.agencyCtx, owner.workspace.id, true);
    expect(await loadWorkspaceContext(user.id, owner.workspace.id)).toBeNull();
    expect(await loadWorkspaceContext(owner.user.id, owner.workspace.id)).not.toBeNull();
  });
});
