/**
 * Contacts: CRUD, search, filtering, duplicate prevention, tags and
 * custom-field values. Every query is scoped by ctx.workspaceId.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import { assertPermission, can, isWorkspaceUser, type WorkspaceContext } from "../authz/context";
import { ConflictError, DuplicateContactError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { recordActivity } from "./activity";
import { recordAudit } from "./audit";
import { notifyUser } from "./notifications";
import { parseInput } from "./parse";
import { parseCustomFieldValue, type CustomFieldType } from "@/lib/custom-fields";
import { contactDisplayName, emptyToNull, normalizeEmail, normalizePhone } from "@/lib/normalize";
import { contactInput, contactListQuery, type ContactInput } from "@/lib/validation/crm";

const listSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  company: true,
  source: true,
  lifecycleStatus: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ContactSelect;

export type ContactListItem = Prisma.ContactGetPayload<{ select: typeof listSelect }>;

function searchConditions(q: string): Prisma.ContactWhereInput[] {
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
  return tokens.map((token) => {
    const or: Prisma.ContactWhereInput[] = [
      { firstName: { contains: token, mode: "insensitive" } },
      { lastName: { contains: token, mode: "insensitive" } },
      { emailNormalized: { contains: token.toLowerCase() } },
      { company: { contains: token, mode: "insensitive" } },
    ];
    const digits = token.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ phoneNormalized: { contains: digits } });
    return { OR: or };
  });
}

export async function listContacts(ctx: WorkspaceContext, rawQuery: unknown) {
  assertPermission(ctx, "contacts:read");
  const query = contactListQuery.parse(rawQuery ?? {});

  const where: Prisma.ContactWhereInput = {
    workspaceId: ctx.workspaceId,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.status ? { lifecycleStatus: query.status } : {}),
    ...(query.tag ? { tags: { some: { tagId: query.tag } } } : {}),
    ...(query.assignee ? { assignedToId: query.assignee === "unassigned" ? null : query.assignee } : {}),
    ...(query.source ? { source: { equals: query.source, mode: "insensitive" } } : {}),
    ...(query.q ? { AND: searchConditions(query.q) } : {}),
  };

  const dir = query.dir;
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    query.sort === "name"
      ? [{ lastName: { sort: dir, nulls: "last" } }, { firstName: { sort: dir, nulls: "last" } }]
      : query.sort === "email"
        ? [{ emailNormalized: { sort: dir, nulls: "last" } }]
        : query.sort === "company"
          ? [{ company: { sort: dir, nulls: "last" } }]
          : [{ [query.sort]: dir }];
  orderBy.push({ id: "asc" }); // stable pagination

  const [total, items] = await prisma.$transaction([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: listSelect,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)), query };
}

export async function getContact(ctx: WorkspaceContext, contactId: string) {
  assertPermission(ctx, "contacts:read");
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: ctx.workspaceId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: "asc" } },
      fieldValues: true,
      opportunities: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          valueCents: true,
          status: true,
          stage: { select: { name: true } },
          pipeline: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!contact) throw new NotFoundError("Contact");
  return contact;
}

export type ContactDetail = Awaited<ReturnType<typeof getContact>>;

/**
 * Finds an existing, non-archived contact that conflicts with the given email
 * or phone under the workspace duplicate policy. Never merges anything.
 */
export async function findDuplicateContact(
  db: Db,
  ctx: WorkspaceContext,
  values: { emailNormalized: string | null; phoneNormalized: string | null },
  excludeId?: string,
): Promise<{ id: string; matchedOn: "email" | "phone" } | null> {
  const policy = ctx.workspace.duplicatePolicy;
  if (policy === "NONE") return null;
  const base = { workspaceId: ctx.workspaceId, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) };
  if (values.emailNormalized) {
    const match = await db.contact.findFirst({ where: { ...base, emailNormalized: values.emailNormalized }, select: { id: true } });
    if (match) return { id: match.id, matchedOn: "email" };
  }
  if (policy === "EMAIL_OR_PHONE" && values.phoneNormalized) {
    const match = await db.contact.findFirst({ where: { ...base, phoneNormalized: values.phoneNormalized }, select: { id: true } });
    if (match) return { id: match.id, matchedOn: "phone" };
  }
  return null;
}

/** Serializes duplicate-sensitive writes within one workspace (transaction-scoped lock). */
async function lockWorkspaceContacts(tx: Db, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"contacts:" + workspaceId}))`;
}

async function validateAssignee(ctx: WorkspaceContext, assigneeId: string | undefined) {
  if (assigneeId && !(await isWorkspaceUser(ctx, assigneeId))) {
    throw new ValidationError("The assigned user does not have access to this workspace.", {
      assignedToId: ["Choose a member of this workspace"],
    });
  }
}

async function validateTagIds(db: Db, ctx: WorkspaceContext, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const count = await db.tag.count({ where: { workspaceId: ctx.workspaceId, id: { in: tagIds } } });
  if (count !== new Set(tagIds).size) throw new ValidationError("One or more tags are invalid.", { tagIds: ["Invalid tag"] });
}

/**
 * Validates custom-field input against active definitions. In "full" mode
 * (create) every required field must be present; in "partial" mode (update)
 * only submitted fields are validated and written.
 */
async function resolveCustomFieldValues(
  db: Db,
  ctx: WorkspaceContext,
  raw: Record<string, unknown> | undefined,
  mode: "full" | "partial",
) {
  const definitions = await db.contactFieldDefinition.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    orderBy: { position: "asc" },
  });
  const known = new Set(definitions.map((d) => d.id));
  const unknownKeys = Object.keys(raw ?? {}).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) throw new ValidationError("Unknown custom field.", { customFields: ["Unknown custom field"] });

  const errors: Record<string, string[]> = {};
  const writes: Array<{ fieldId: string; value: ReturnType<typeof parseCustomFieldValue> & { ok: true } }> = [];
  for (const def of definitions) {
    const submitted = raw !== undefined && Object.prototype.hasOwnProperty.call(raw, def.id);
    if (!submitted && mode === "partial") continue;
    const result = parseCustomFieldValue({ ...def, type: def.type as CustomFieldType }, submitted ? raw![def.id] : undefined);
    if (!result.ok) errors[`cf_${def.id}`] = [result.error];
    else writes.push({ fieldId: def.id, value: result });
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(Object.values(errors)[0][0], errors);
  }
  return writes;
}

async function writeCustomFieldValues(
  tx: Db,
  ctx: WorkspaceContext,
  contactId: string,
  writes: Awaited<ReturnType<typeof resolveCustomFieldValues>>,
) {
  for (const { fieldId, value } of writes) {
    if (value.value === null) {
      await tx.contactFieldValue.deleteMany({ where: { contactId, fieldId, workspaceId: ctx.workspaceId } });
    } else {
      await tx.contactFieldValue.upsert({
        where: { contactId_fieldId: { contactId, fieldId } },
        create: { ...value.value, contactId, fieldId, workspaceId: ctx.workspaceId },
        update: value.value,
      });
    }
  }
}

function contactData(input: ContactInput) {
  return {
    firstName: emptyToNull(input.firstName),
    lastName: emptyToNull(input.lastName),
    email: emptyToNull(input.email),
    emailNormalized: normalizeEmail(input.email),
    phone: emptyToNull(input.phone),
    phoneNormalized: normalizePhone(input.phone),
    company: emptyToNull(input.company),
    source: emptyToNull(input.source),
    lifecycleStatus: input.lifecycleStatus,
    assignedToId: input.assignedToId ?? null,
  };
}

export async function createContact(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "contacts:write");
  const input = parseInput(contactInput, raw);
  const tagIds = [...new Set(input.tagIds ?? [])];
  if (tagIds.length > 0) assertPermission(ctx, "tags:assign");
  await validateAssignee(ctx, input.assignedToId);
  await validateTagIds(prisma, ctx, tagIds);
  const fieldWrites = await resolveCustomFieldValues(prisma, ctx, input.customFields, "full");
  const data = contactData(input);

  const contact = await prisma.$transaction(async (tx) => {
    await lockWorkspaceContacts(tx, ctx.workspaceId);
    const duplicate = await findDuplicateContact(tx, ctx, data);
    if (duplicate) throw new DuplicateContactError(duplicate.id, duplicate.matchedOn);

    const created = await tx.contact.create({
      data: { ...data, workspaceId: ctx.workspaceId, createdById: ctx.userId },
    });
    if (tagIds.length > 0) {
      await tx.contactTag.createMany({
        data: tagIds.map((tagId) => ({ contactId: created.id, tagId, workspaceId: ctx.workspaceId, addedById: ctx.userId })),
      });
    }
    await writeCustomFieldValues(tx, ctx, created.id, fieldWrites);
    await recordActivity(tx, ctx, {
      type: "contact.created",
      contactId: created.id,
      metadata: { name: contactDisplayName(created), source: created.source },
    });
    if (created.assignedToId && created.assignedToId !== ctx.userId) {
      await notifyUser(tx, {
        userId: created.assignedToId,
        workspaceId: ctx.workspaceId,
        type: "contact.assigned",
        title: `You were assigned ${contactDisplayName(created)}`,
        href: `/w/${ctx.workspaceId}/contacts/${created.id}`,
      });
    }
    return created;
  });
  return contact;
}

const TRACKED_FIELDS = ["firstName", "lastName", "email", "phone", "company", "source", "lifecycleStatus", "assignedToId"] as const;

export async function updateContact(ctx: WorkspaceContext, contactId: string, raw: unknown) {
  assertPermission(ctx, "contacts:write");
  const input = parseInput(contactInput, raw);
  await validateAssignee(ctx, input.assignedToId);
  const tagIds = input.tagIds ? [...new Set(input.tagIds)] : undefined;
  if (tagIds) await validateTagIds(prisma, ctx, tagIds);
  const fieldWrites = await resolveCustomFieldValues(prisma, ctx, input.customFields, "partial");
  const data = contactData(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      include: { tags: { select: { tagId: true } } },
    });
    if (!existing) throw new NotFoundError("Contact");

    await lockWorkspaceContacts(tx, ctx.workspaceId);
    const duplicate = await findDuplicateContact(tx, ctx, data, contactId);
    if (duplicate) throw new DuplicateContactError(duplicate.id, duplicate.matchedOn);

    const updated = await tx.contact.update({ where: { id: contactId }, data });

    const changed = TRACKED_FIELDS.filter((f) => (existing[f] ?? null) !== (updated[f] ?? null));
    if (tagIds) {
      const current = new Set(existing.tags.map((t) => t.tagId));
      const desired = new Set(tagIds);
      const toAdd = tagIds.filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !desired.has(id));
      if (toAdd.length || toRemove.length) {
        assertPermission(ctx, "tags:assign");
        await tx.contactTag.deleteMany({ where: { contactId, tagId: { in: toRemove }, workspaceId: ctx.workspaceId } });
        await tx.contactTag.createMany({
          data: toAdd.map((tagId) => ({ contactId, tagId, workspaceId: ctx.workspaceId, addedById: ctx.userId })),
        });
        (changed as string[]).push("tags");
      }
    }
    if (fieldWrites.length > 0) {
      await writeCustomFieldValues(tx, ctx, contactId, fieldWrites);
      (changed as string[]).push("customFields");
    }
    if (changed.length > 0) {
      await recordActivity(tx, ctx, { type: "contact.updated", contactId, metadata: { fields: changed } });
    }
    if (updated.assignedToId && updated.assignedToId !== existing.assignedToId && updated.assignedToId !== ctx.userId) {
      await notifyUser(tx, {
        userId: updated.assignedToId,
        workspaceId: ctx.workspaceId,
        type: "contact.assigned",
        title: `You were assigned ${contactDisplayName(updated)}`,
        href: `/w/${ctx.workspaceId}/contacts/${updated.id}`,
      });
    }
    return updated;
  });
}

export async function setContactArchived(ctx: WorkspaceContext, contactId: string, archived: boolean) {
  assertPermission(ctx, "contacts:archive");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Contact");
    if (!archived) {
      // Restoring must not create a duplicate under the current policy.
      await lockWorkspaceContacts(tx, ctx.workspaceId);
      const duplicate = await findDuplicateContact(tx, ctx, existing, contactId);
      if (duplicate) throw new DuplicateContactError(duplicate.id, duplicate.matchedOn);
    }
    const updated = await tx.contact.update({ where: { id: contactId }, data: { archivedAt: archived ? new Date() : null } });
    await recordActivity(tx, ctx, { type: archived ? "contact.archived" : "contact.restored", contactId });
    return updated;
  });
}

/**
 * Permanently deletes a contact. Safeguards: requires `contacts:delete`
 * (workspace admins) and the contact must already be archived.
 */
export async function deleteContact(ctx: WorkspaceContext, contactId: string) {
  assertPermission(ctx, "contacts:delete");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Contact");
    if (!existing.archivedAt) throw new ConflictError("Archive the contact before deleting it permanently.");
    await tx.contact.delete({ where: { id: contactId } });
    await recordAudit(tx, ctx, {
      action: "contact.deleted",
      targetType: "contact",
      targetId: contactId,
      metadata: { name: contactDisplayName(existing), email: existing.email },
    });
  });
}

export async function addTagToContact(ctx: WorkspaceContext, contactId: string, tag: { tagId?: string; name?: string }) {
  assertPermission(ctx, "tags:assign");
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId }, select: { id: true } });
    if (!contact) throw new NotFoundError("Contact");

    let tagId = tag.tagId;
    let tagName: string | undefined;
    if (tagId) {
      const existing = await tx.tag.findFirst({ where: { id: tagId, workspaceId: ctx.workspaceId } });
      if (!existing) throw new NotFoundError("Tag");
      tagName = existing.name;
    } else {
      const name = tag.name?.trim();
      if (!name || name.length > 40) throw new ValidationError("Enter a tag name (40 characters max).", { name: ["Invalid tag name"] });
      const existing = await tx.tag.findUnique({
        where: { workspaceId_nameNormalized: { workspaceId: ctx.workspaceId, nameNormalized: name.toLowerCase() } },
      });
      if (existing) {
        tagId = existing.id;
        tagName = existing.name;
      } else {
        if (!can(ctx, "tags:manage")) throw new ForbiddenError("Only workspace admins can create new tags.");
        const created = await tx.tag.create({ data: { workspaceId: ctx.workspaceId, name, nameNormalized: name.toLowerCase() } });
        tagId = created.id;
        tagName = created.name;
      }
    }

    const already = await tx.contactTag.findUnique({ where: { contactId_tagId: { contactId, tagId: tagId! } } });
    if (already) return { tagId: tagId!, added: false };
    await tx.contactTag.create({ data: { contactId, tagId: tagId!, workspaceId: ctx.workspaceId, addedById: ctx.userId } });
    await recordActivity(tx, ctx, { type: "contact.tag_added", contactId, metadata: { tag: tagName ?? null } });
    return { tagId: tagId!, added: true };
  });
}

export async function removeTagFromContact(ctx: WorkspaceContext, contactId: string, tagId: string) {
  assertPermission(ctx, "tags:assign");
  return prisma.$transaction(async (tx) => {
    const link = await tx.contactTag.findFirst({
      where: { contactId, tagId, workspaceId: ctx.workspaceId },
      include: { tag: { select: { name: true } } },
    });
    if (!link) throw new NotFoundError("Tag assignment");
    await tx.contactTag.delete({ where: { contactId_tagId: { contactId, tagId } } });
    await recordActivity(tx, ctx, { type: "contact.tag_removed", contactId, metadata: { tag: link.tag.name } });
  });
}

/** Lightweight option list for contact pickers. */
export async function searchContactOptions(ctx: WorkspaceContext, q: string | undefined, take = 20) {
  assertPermission(ctx, "contacts:read");
  return prisma.contact.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null, ...(q?.trim() ? { AND: searchConditions(q.trim()) } : {}) },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true },
    orderBy: { updatedAt: "desc" },
    take: Math.min(take, 50),
  });
}

export async function listContactSources(ctx: WorkspaceContext) {
  assertPermission(ctx, "contacts:read");
  const rows = await prisma.contact.findMany({
    where: { workspaceId: ctx.workspaceId, source: { not: null } },
    distinct: ["source"],
    select: { source: true },
    orderBy: { source: "asc" },
    take: 100,
  });
  return rows.map((r) => r.source!).filter(Boolean);
}
