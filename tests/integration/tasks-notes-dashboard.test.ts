import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listActivities } from "@/server/services/activity";
import { createContact, setContactArchived } from "@/server/services/contacts";
import { getDashboard } from "@/server/services/dashboard";
import { createNote, deleteNote, listNotes } from "@/server/services/notes";
import { listNotifications } from "@/server/services/notifications";
import { createOpportunity, setOpportunityStatus } from "@/server/services/opportunities";
import { createTask, deleteTask, listTasks, setTaskCompleted } from "@/server/services/tasks";
import { globalSearch } from "@/server/services/search";
import { addWorkspaceMember, createAgencyOwner, defaultPipeline } from "../support/factories";

describe("tasks", () => {
  it("creates, assigns, filters, completes and reopens tasks", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    const contact = await createContact(owner.ctx, { firstName: "Client" });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    const overdue = await createTask(owner.ctx, { title: "Follow up", dueAt: yesterday, assigneeId: member.user.id, contactId: contact.id });
    await createTask(owner.ctx, { title: "Someday" });

    expect((await listTasks(owner.ctx, { filter: "open" })).length).toBe(2);
    expect((await listTasks(owner.ctx, { filter: "overdue" })).map((t) => t.title)).toEqual(["Follow up"]);
    expect((await listTasks(member.ctx, { filter: "mine" })).map((t) => t.title)).toEqual(["Follow up"]);
    expect((await listNotifications(member.user.id)).unread).toBe(1);

    await setTaskCompleted(member.ctx, overdue.id, true);
    expect((await listTasks(owner.ctx, { filter: "completed" })).map((t) => t.title)).toEqual(["Follow up"]);
    await setTaskCompleted(member.ctx, overdue.id, false);
    const types = (await listActivities(owner.ctx, { contactId: contact.id })).map((a) => a.type);
    expect(types).toEqual(["task.reopened", "task.completed", "task.created", "contact.created"]);

    // Only creator or admin may delete
    await expect(deleteTask(member.ctx, overdue.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteTask(owner.ctx, overdue.id);
  });

  it("inherits the opportunity's contact when linking a task to an opportunity", async () => {
    const { ctx } = await createAgencyOwner();
    const pipeline = await defaultPipeline(ctx.workspaceId);
    const contact = await createContact(ctx, { firstName: "Buyer" });
    const opp = await createOpportunity(ctx, { name: "Deal", pipelineId: pipeline.id, stageId: pipeline.stages[0].id, contactId: contact.id });
    const task = await createTask(ctx, { title: "Send proposal", opportunityId: opp.id });
    expect(task.contactId).toBe(contact.id);
  });
});

describe("notes", () => {
  it("persists notes on the contact timeline and restricts deletion", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    const contact = await createContact(owner.ctx, { firstName: "Noted" });
    const note = await createNote(owner.ctx, { body: "Prefers email.", contactId: contact.id });
    expect((await listNotes(member.ctx, { contactId: contact.id })).map((n) => n.body)).toEqual(["Prefers email."]);
    await expect(deleteNote(member.ctx, note.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteNote(owner.ctx, note.id);
    expect(await prisma.note.count()).toBe(0);
    await expect(createNote(owner.ctx, { body: "orphan" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("dashboard", () => {
  it("reflects live records", async () => {
    const { ctx } = await createAgencyOwner();
    const empty = await getDashboard(ctx);
    expect(empty).toMatchObject({ totalContacts: 0, openOpportunities: 0, pipelineValueCents: 0, tasksDue: 0 });

    const pipeline = await defaultPipeline(ctx.workspaceId);
    const c1 = await createContact(ctx, { firstName: "One" });
    const c2 = await createContact(ctx, { firstName: "Two" });
    await setContactArchived(ctx, c2.id, true);
    const won = await createOpportunity(ctx, { name: "Won deal", pipelineId: pipeline.id, stageId: pipeline.stages[4].id, valueCents: "800" });
    await createOpportunity(ctx, { name: "Open deal", pipelineId: pipeline.id, stageId: pipeline.stages[0].id, valueCents: "1200", contactId: c1.id });
    await setOpportunityStatus(ctx, won.id, "WON");
    await createTask(ctx, { title: "Overdue", dueAt: new Date(Date.now() - 3_600_000).toISOString(), assigneeId: ctx.userId });

    const d = await getDashboard(ctx);
    expect(d.totalContacts).toBe(1);
    expect(d.newContacts30d).toBe(1);
    expect(d.openOpportunities).toBe(1);
    expect(d.pipelineValueCents).toBe(120000);
    expect(d.wonThisMonth).toEqual({ count: 1, valueCents: 80000 });
    expect(d.tasksDue).toBe(1);
    expect(d.tasksOverdue).toBe(1);
    expect(d.myTasks.map((t) => t.title)).toEqual(["Overdue"]);
    expect(d.activities.length).toBeGreaterThan(0);
  });
});

describe("global search", () => {
  it("searches contacts, opportunities and tasks within the workspace only", async () => {
    const a = await createAgencyOwner("A");
    const b = await createAgencyOwner("B");
    await createContact(a.ctx, { firstName: "Zelda", company: "Hyrule" });
    await createContact(b.ctx, { firstName: "Zelda", company: "Other" });
    const results = await globalSearch(a.ctx, "zelda");
    expect(results.contacts).toHaveLength(1);
    expect(results.contacts[0].company).toBe("Hyrule");
    expect((await globalSearch(a.ctx, "z")).contacts).toHaveLength(0);
  });
});
