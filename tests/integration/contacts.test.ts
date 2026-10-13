import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  addTagToContact,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  removeTagFromContact,
  setContactArchived,
  updateContact,
} from "@/server/services/contacts";
import { createFieldDefinition, updateFieldDefinition } from "@/server/services/custom-fields";
import { createTag } from "@/server/services/tags";
import { updateWorkspaceSettings } from "@/server/services/tenancy";
import { addWorkspaceMember, createAgencyOwner, wsCtx } from "../support/factories";

describe("contacts", () => {
  it("creates a contact with normalized fields, tags, custom fields and an activity", async () => {
    const { ctx, user } = await createAgencyOwner();
    const tag = await createTag(ctx, { name: "Hot lead", color: "red" });
    const budget = await createFieldDefinition(ctx, { label: "Budget", type: "NUMBER" });
    const services = await createFieldDefinition(ctx, { label: "Services", type: "MULTI_SELECT", options: "SEO\nPPC" });

    const contact = await createContact(ctx, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "  Ada@Example.COM ",
      phone: "+1 (555) 010-2000",
      source: "Website",
      assignedToId: user.id,
      tagIds: [tag.id],
      customFields: { [budget.id]: "12,500", [services.id]: ["SEO", "PPC"] },
    });

    expect(contact.emailNormalized).toBe("ada@example.com");
    expect(contact.phoneNormalized).toBe("+15550102000");
    const detail = await getContact(ctx, contact.id);
    expect(detail.tags.map((t) => t.tag.name)).toEqual(["Hot lead"]);
    const values = Object.fromEntries(detail.fieldValues.map((v) => [v.fieldId, v]));
    expect(values[budget.id].numberValue).toBe(12500);
    expect(values[services.id].optionValues).toEqual(["SEO", "PPC"]);
    const activity = await prisma.activity.findMany({ where: { contactId: contact.id } });
    expect(activity.map((a) => a.type)).toEqual(["contact.created"]);
  });

  it("rejects invalid custom-field values and required fields atomically", async () => {
    const { ctx } = await createAgencyOwner();
    const tier = await createFieldDefinition(ctx, { label: "Tier", type: "SINGLE_SELECT", options: "Gold\nSilver", required: "on" });
    await expect(createContact(ctx, { firstName: "A" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createContact(ctx, { firstName: "A", customFields: { [tier.id]: "Platinum" } })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.contact.count()).toBe(0);
  });

  it("prevents duplicates according to the workspace policy without merging", async () => {
    const { ctx } = await createAgencyOwner();
    const first = await createContact(ctx, { firstName: "A", email: "dup@example.com", phone: "555-111-2222" });

    // Default policy: EMAIL (case-insensitive)
    await expect(createContact(ctx, { firstName: "B", email: "DUP@example.com" })).rejects.toMatchObject({
      code: "DUPLICATE",
      details: { duplicateId: first.id },
    });
    // Same phone is allowed under EMAIL policy
    await expect(createContact(ctx, { firstName: "C", phone: "(555) 111 2222" })).resolves.toBeTruthy();

    // Switch to EMAIL_OR_PHONE: phone duplicates are now blocked
    await updateWorkspaceSettings(ctx, { name: ctx.workspace.name, timezone: "UTC", currency: "USD", duplicatePolicy: "EMAIL_OR_PHONE" });
    const strict = await wsCtx(ctx.userId, ctx.workspaceId);
    await expect(createContact(strict, { firstName: "D", phone: "555 111 2222" })).rejects.toMatchObject({ code: "DUPLICATE" });

    // Policy NONE allows duplicates
    await updateWorkspaceSettings(ctx, { name: ctx.workspace.name, timezone: "UTC", currency: "USD", duplicatePolicy: "NONE" });
    const relaxed = await wsCtx(ctx.userId, ctx.workspaceId);
    await expect(createContact(relaxed, { firstName: "E", email: "dup@example.com" })).resolves.toBeTruthy();
  });

  it("serializes concurrent duplicate creation", async () => {
    const { ctx } = await createAgencyOwner();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => createContact(ctx, { firstName: `Racer ${i}`, email: "race@example.com" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.contact.count({ where: { emailNormalized: "race@example.com" } })).toBe(1);
  });

  it("updates contacts, tracks changed fields, and checks duplicates excluding itself", async () => {
    const { ctx } = await createAgencyOwner();
    const c = await createContact(ctx, { firstName: "A", email: "a@example.com" });
    await createContact(ctx, { firstName: "B", email: "b@example.com" });
    await updateContact(ctx, c.id, { firstName: "Alice", email: "a@example.com", lifecycleStatus: "CUSTOMER" });
    await expect(updateContact(ctx, c.id, { firstName: "Alice", email: "b@example.com" })).rejects.toMatchObject({ code: "DUPLICATE" });
    const updated = await prisma.activity.findFirstOrThrow({ where: { contactId: c.id, type: "contact.updated" } });
    expect(updated.metadata).toEqual({ fields: ["firstName", "lifecycleStatus"] });
  });

  it("searches, filters, sorts and paginates", async () => {
    const { ctx } = await createAgencyOwner();
    const vip = await createTag(ctx, { name: "VIP" });
    for (let i = 0; i < 30; i++) {
      await createContact(ctx, {
        firstName: `Person${String(i).padStart(2, "0")}`,
        lastName: i % 2 ? "Odd" : "Even",
        email: `p${i}@example.com`,
        company: i < 5 ? "Globex" : "Initech",
        lifecycleStatus: i < 3 ? "CUSTOMER" : "LEAD",
        tagIds: i % 10 === 0 ? [vip.id] : [],
      });
    }
    const page1 = await listContacts(ctx, { pageSize: "10", sort: "email", dir: "asc" });
    expect(page1.total).toBe(30);
    expect(page1.pageCount).toBe(3);
    expect(page1.items).toHaveLength(10);
    const page3 = await listContacts(ctx, { pageSize: "10", page: "3", sort: "email", dir: "asc" });
    expect(new Set([...page1.items, ...page3.items].map((c) => c.id)).size).toBe(20);

    expect((await listContacts(ctx, { q: "globex" })).total).toBe(5);
    expect((await listContacts(ctx, { q: "person01 odd" })).total).toBe(1);
    expect((await listContacts(ctx, { status: "CUSTOMER" })).total).toBe(3);
    expect((await listContacts(ctx, { tag: vip.id })).total).toBe(3);
  });

  it("adds and removes tags, creating new tags only for admins", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    const c = await createContact(member.ctx, { firstName: "Tagged" });

    await expect(addTagToContact(member.ctx, c.id, { name: "Brand new" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { tagId } = await addTagToContact(owner.ctx, c.id, { name: "Brand new" });
    // Member can assign the now-existing tag (idempotently)
    expect((await addTagToContact(member.ctx, c.id, { name: "brand NEW" })).added).toBe(false);
    await removeTagFromContact(member.ctx, c.id, tagId);
    expect(await prisma.contactTag.count({ where: { contactId: c.id } })).toBe(0);
  });

  it("archives before permanent deletion, and only admins may delete", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    const c = await createContact(member.ctx, { firstName: "Gone" });

    await expect(deleteContact(owner.ctx, c.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await setContactArchived(member.ctx, c.id, true);
    expect((await listContacts(owner.ctx, {})).total).toBe(0);
    expect((await listContacts(owner.ctx, { archived: "1" })).total).toBe(1);
    await expect(deleteContact(member.ctx, c.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteContact(owner.ctx, c.id);
    expect(await prisma.contact.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "contact.deleted", targetId: c.id } })).toBe(1);
  });

  it("refuses to remove a select option that is still in use", async () => {
    const { ctx } = await createAgencyOwner();
    const tier = await createFieldDefinition(ctx, { label: "Tier", type: "SINGLE_SELECT", options: "Gold\nSilver" });
    await createContact(ctx, { firstName: "A", customFields: { [tier.id]: "Gold" } });
    await expect(updateFieldDefinition(ctx, tier.id, { label: "Tier", options: "Silver" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateFieldDefinition(ctx, tier.id, { label: "Level", options: "Gold\nSilver\nBronze" })).resolves.toMatchObject({ label: "Level" });
  });

  it("rejects the database CHECK constraint for identity-less contacts", async () => {
    const { ctx } = await createAgencyOwner();
    await expect(prisma.contact.create({ data: { workspaceId: ctx.workspaceId, firstName: "  " } })).rejects.toThrow();
  });
});
