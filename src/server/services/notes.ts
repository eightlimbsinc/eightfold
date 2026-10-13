import { prisma } from "../db";
import { assertPermission, can, type WorkspaceContext } from "../authz/context";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { recordActivity } from "./activity";
import { parseInput } from "./parse";
import { noteInput } from "@/lib/validation/crm";

export async function listNotes(ctx: WorkspaceContext, filter: { contactId?: string; opportunityId?: string }) {
  assertPermission(ctx, "workspace:read");
  if (!filter.contactId && !filter.opportunityId) return [];
  return prisma.note.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
    },
    select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function createNote(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "notes:write");
  const input = parseInput(noteInput, raw);
  return prisma.$transaction(async (tx) => {
    let contactId = input.contactId ?? null;
    if (input.opportunityId) {
      const opp = await tx.opportunity.findFirst({ where: { id: input.opportunityId, workspaceId: ctx.workspaceId }, select: { contactId: true } });
      if (!opp) throw new ValidationError("Invalid opportunity.");
      contactId = contactId ?? opp.contactId;
    }
    if (contactId) {
      const exists = await tx.contact.count({ where: { id: contactId, workspaceId: ctx.workspaceId } });
      if (!exists) throw new ValidationError("Invalid contact.");
    }
    const note = await tx.note.create({
      data: {
        workspaceId: ctx.workspaceId,
        body: input.body,
        contactId,
        opportunityId: input.opportunityId ?? null,
        authorId: ctx.userId,
      },
    });
    await recordActivity(tx, ctx, {
      type: "note.created",
      contactId,
      opportunityId: note.opportunityId,
      entityType: "note",
      entityId: note.id,
      metadata: { excerpt: note.body.slice(0, 140) },
    });
    return note;
  });
}

export async function deleteNote(ctx: WorkspaceContext, noteId: string) {
  assertPermission(ctx, "notes:write");
  const note = await prisma.note.findFirst({ where: { id: noteId, workspaceId: ctx.workspaceId } });
  if (!note) throw new NotFoundError("Note");
  if (note.authorId !== ctx.userId && !can(ctx, "notes:delete_any")) {
    throw new ForbiddenError("You can only delete your own notes.");
  }
  await prisma.note.delete({ where: { id: noteId } });
}
