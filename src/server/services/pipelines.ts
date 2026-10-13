import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { assertPermission, type WorkspaceContext } from "../authz/context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { recordAudit } from "./audit";
import { parseInput } from "./parse";
import { computePipelineTotals, planStageChanges } from "@/lib/pipeline-math";
import { pipelineInput } from "@/lib/validation/crm";

export async function listPipelines(ctx: WorkspaceContext) {
  assertPermission(ctx, "pipelines:read");
  const pipelines = await prisma.pipeline.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    include: {
      stages: { orderBy: { position: "asc" } },
      opportunities: { where: { archivedAt: null }, select: { stageId: true, valueCents: true, status: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return pipelines.map(({ opportunities, ...p }) => ({ ...p, totals: computePipelineTotals(p.stages, opportunities) }));
}

export async function getPipelineWithStages(ctx: WorkspaceContext, pipelineId: string) {
  assertPermission(ctx, "pipelines:read");
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, workspaceId: ctx.workspaceId },
    include: { stages: { orderBy: { position: "asc" }, include: { _count: { select: { opportunities: true } } } } },
  });
  if (!pipeline) throw new NotFoundError("Pipeline");
  return pipeline;
}

export const BOARD_STATUS_FILTERS = ["open", "won", "lost", "all"] as const;
export type BoardStatusFilter = (typeof BOARD_STATUS_FILTERS)[number];

/** Pipeline board: stages, visible opportunities, and totals across all non-archived opportunities. */
export async function getPipelineBoard(ctx: WorkspaceContext, pipelineId: string, status: BoardStatusFilter = "open") {
  assertPermission(ctx, "opportunities:read");
  const pipeline = await getPipelineWithStages(ctx, pipelineId);
  const opportunities = await prisma.opportunity.findMany({
    where: { workspaceId: ctx.workspaceId, pipelineId, archivedAt: null },
    select: {
      id: true,
      name: true,
      valueCents: true,
      status: true,
      stageId: true,
      expectedCloseDate: true,
      updatedAt: true,
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: [{ stageChangedAt: "desc" }],
  });
  const totals = computePipelineTotals(pipeline.stages, opportunities);
  const visible =
    status === "all" ? opportunities : opportunities.filter((o) => o.status === status.toUpperCase());
  return { pipeline, opportunities: visible, totals };
}

export type PipelineBoard = Awaited<ReturnType<typeof getPipelineBoard>>;

function uniqueNameError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ValidationError("A pipeline with this name already exists.", { name: ["Name already in use"] });
  }
  return error;
}

export async function createPipeline(ctx: WorkspaceContext, raw: unknown) {
  assertPermission(ctx, "pipelines:manage");
  const input = parseInput(pipelineInput, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const max = await tx.pipeline.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { position: true } });
      const pipeline = await tx.pipeline.create({
        data: { workspaceId: ctx.workspaceId, name: input.name, position: (max._max.position ?? -1) + 1 },
      });
      await tx.pipelineStage.createMany({
        data: input.stages.map((s, position) => ({
          workspaceId: ctx.workspaceId,
          pipelineId: pipeline.id,
          name: s.name,
          probability: s.probability ?? null,
          position,
        })),
      });
      await recordAudit(tx, ctx, { action: "pipeline.created", targetType: "pipeline", targetId: pipeline.id, metadata: { name: pipeline.name } });
      return pipeline;
    });
  } catch (error) {
    throw uniqueNameError(error);
  }
}

/**
 * Renames the pipeline and synchronizes its ordered stage list. Stages that
 * still hold opportunities cannot be removed (also enforced by ON DELETE RESTRICT).
 */
export async function updatePipeline(ctx: WorkspaceContext, pipelineId: string, raw: unknown) {
  assertPermission(ctx, "pipelines:manage");
  const input = parseInput(pipelineInput, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id: pipelineId, workspaceId: ctx.workspaceId },
        include: { stages: { include: { _count: { select: { opportunities: true } } } } },
      });
      if (!pipeline) throw new NotFoundError("Pipeline");

      // Stage ids from the client must belong to this pipeline.
      const ownIds = new Set(pipeline.stages.map((s) => s.id));
      const foreign = input.stages.find((s) => s.id && !ownIds.has(s.id));
      if (foreign) throw new ValidationError("Invalid stage.", { stages: ["Invalid stage"] });

      const plan = planStageChanges(pipeline.stages, input.stages);
      const blocked = pipeline.stages.filter((s) => plan.remove.includes(s.id) && s._count.opportunities > 0);
      if (blocked.length > 0) {
        throw new ConflictError(
          `Stage "${blocked[0].name}" still has ${blocked[0]._count.opportunities} opportunit${blocked[0]._count.opportunities === 1 ? "y" : "ies"}. Move them before removing the stage.`,
        );
      }

      await tx.pipeline.update({ where: { id: pipelineId }, data: { name: input.name } });
      if (plan.remove.length > 0) await tx.pipelineStage.deleteMany({ where: { id: { in: plan.remove }, pipelineId } });
      for (const s of plan.update) {
        await tx.pipelineStage.update({ where: { id: s.id }, data: { name: s.name, probability: s.probability, position: s.position } });
      }
      if (plan.create.length > 0) {
        await tx.pipelineStage.createMany({
          data: plan.create.map((s) => ({ ...s, workspaceId: ctx.workspaceId, pipelineId })),
        });
      }
      await recordAudit(tx, ctx, {
        action: "pipeline.updated",
        targetType: "pipeline",
        targetId: pipelineId,
        metadata: { name: input.name, created: plan.create.length, removed: plan.remove.length },
      });
      return pipeline;
    });
  } catch (error) {
    throw uniqueNameError(error);
  }
}

export async function deletePipeline(ctx: WorkspaceContext, pipelineId: string) {
  assertPermission(ctx, "pipelines:manage");
  await prisma.$transaction(async (tx) => {
    const pipeline = await tx.pipeline.findFirst({
      where: { id: pipelineId, workspaceId: ctx.workspaceId },
      include: { _count: { select: { opportunities: true } } },
    });
    if (!pipeline) throw new NotFoundError("Pipeline");
    if (pipeline._count.opportunities > 0) {
      throw new ConflictError(`This pipeline has ${pipeline._count.opportunities} opportunities. Move or delete them first.`);
    }
    await tx.pipeline.delete({ where: { id: pipelineId } });
    await recordAudit(tx, ctx, { action: "pipeline.deleted", targetType: "pipeline", targetId: pipelineId, metadata: { name: pipeline.name } });
  });
}
