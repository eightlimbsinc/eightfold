import { prisma } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { recordAudit } from "./audit";
import { parseInput } from "./parse";
import { fieldKeyFromLabel } from "@/lib/custom-fields";
import { customFieldDefinitionInput } from "@/lib/validation/crm";

export async function listFieldDefinitions(ctx: WorkspaceContext, opts: { includeArchived?: boolean } = {}) {
  assertPermission(ctx, "workspace:read");
  return prisma.contactFieldDefinition.findMany({
    where: { workspaceId: ctx.workspaceId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { values: true } } },
  });
}

export async function createFieldDefinition(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "custom_fields:manage");
  const input = parseInput(customFieldDefinitionInput, raw);
  const key = input.key ?? fieldKeyFromLabel(input.label);
  const isSelect = input.type === "SINGLE_SELECT" || input.type === "MULTI_SELECT";

  return prisma.$transaction(async (tx) => {
    const clash = await tx.contactFieldDefinition.findUnique({ where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } } });
    if (clash) throw new ValidationError("A field with this key already exists.", { key: ["Key already in use"] });
    const max = await tx.contactFieldDefinition.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { position: true } });
    const def = await tx.contactFieldDefinition.create({
      data: {
        workspaceId: ctx.workspaceId,
        key,
        label: input.label,
        type: input.type,
        options: isSelect ? input.options : [],
        required: input.required,
        position: (max._max.position ?? -1) + 1,
      },
    });
    await recordAudit(tx, ctx, { action: "custom_field.created", targetType: "custom_field", targetId: def.id, metadata: { key, type: def.type } });
    return def;
  });
}

/**
 * Updates label, options and required flag. The type and key are immutable so
 * stored values always match their definition.
 */
export async function updateFieldDefinition(ctx: WorkspaceContext, fieldId: string, raw: unknown) {
  assertPermission(ctx, "custom_fields:manage");
  const existing = await prisma.contactFieldDefinition.findFirst({ where: { id: fieldId, workspaceId: ctx.workspaceId } });
  if (!existing) throw new NotFoundError("Custom field");
  const input = parseInput(customFieldDefinitionInput, { ...(raw as object), type: existing.type, key: existing.key });
  const isSelect = existing.type === "SINGLE_SELECT" || existing.type === "MULTI_SELECT";

  if (isSelect) {
    const removed = existing.options.filter((o) => !input.options.includes(o));
    if (removed.length > 0) {
      const inUse = await prisma.contactFieldValue.count({
        where: { fieldId, workspaceId: ctx.workspaceId, optionValues: { hasSome: removed } },
      });
      if (inUse > 0) {
        throw new ConflictError(`Option "${removed[0]}" is used by ${inUse} contact(s). Update those contacts before removing it.`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const def = await tx.contactFieldDefinition.update({
      where: { id: fieldId },
      data: { label: input.label, options: isSelect ? input.options : [], required: input.required },
    });
    await recordAudit(tx, ctx, { action: "custom_field.updated", targetType: "custom_field", targetId: def.id, metadata: { label: def.label } });
    return def;
  });
}

/** Archiving hides a field from forms but keeps its stored values. */
export async function setFieldDefinitionArchived(ctx: WorkspaceContext, fieldId: string, archived: boolean) {
  assertPermission(ctx, "custom_fields:manage");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contactFieldDefinition.findFirst({ where: { id: fieldId, workspaceId: ctx.workspaceId } });
    if (!existing) throw new NotFoundError("Custom field");
    const def = await tx.contactFieldDefinition.update({ where: { id: fieldId }, data: { archivedAt: archived ? new Date() : null } });
    await recordAudit(tx, ctx, {
      action: archived ? "custom_field.archived" : "custom_field.restored",
      targetType: "custom_field",
      targetId: fieldId,
    });
    return def;
  });
}
