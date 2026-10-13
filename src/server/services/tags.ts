import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";
import { NotFoundError, ValidationError } from "../errors";
import { recordAudit } from "./audit";
import { parseInput } from "./parse";
import { tagInput } from "@/lib/validation/crm";

export async function listTags(ctx: WorkspaceContext) {
  assertPermission(ctx, "workspace:read");
  return prisma.tag.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, name: true, color: true, _count: { select: { contacts: true } } },
    orderBy: { nameNormalized: "asc" },
  });
}

function duplicateNameError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ValidationError("A tag with this name already exists.", { name: ["Tag name already in use"] });
  }
  return error;
}

export async function createTag(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "tags:manage");
  const input = parseInput(tagInput, raw);
  try {
    return await prisma.tag.create({
      data: { workspaceId: ctx.workspaceId, name: input.name, nameNormalized: input.name.toLowerCase(), color: input.color },
    });
  } catch (error) {
    throw duplicateNameError(error);
  }
}

export async function updateTag(ctx: WorkspaceContext, tagId: string, raw: unknown) {
  assertPermission(ctx, "tags:manage");
  const input = parseInput(tagInput, raw);
  const existing = await prisma.tag.findFirst({ where: { id: tagId, workspaceId: ctx.workspaceId } });
  if (!existing) throw new NotFoundError("Tag");
  try {
    return await prisma.tag.update({
      where: { id: tagId },
      data: { name: input.name, nameNormalized: input.name.toLowerCase(), color: input.color },
    });
  } catch (error) {
    throw duplicateNameError(error);
  }
}

export async function deleteTag(ctx: WorkspaceContext, tagId: string) {
  assertPermission(ctx, "tags:manage");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.tag.findFirst({ where: { id: tagId, workspaceId: ctx.workspaceId }, include: { _count: { select: { contacts: true } } } });
    if (!existing) throw new NotFoundError("Tag");
    await tx.tag.delete({ where: { id: tagId } });
    await recordAudit(tx, ctx, {
      action: "tag.deleted",
      targetType: "tag",
      targetId: tagId,
      metadata: { name: existing.name, contacts: existing._count.contacts },
    });
  });
}
