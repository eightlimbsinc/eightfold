import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createContact } from "@/server/services/contacts";
import {
  createOpportunity,
  deleteOpportunity,
  moveOpportunityStage,
  setOpportunityArchived,
  setOpportunityStatus,
  updateOpportunity,
} from "@/server/services/opportunities";
import { createPipeline, deletePipeline, getPipelineBoard, listPipelines, updatePipeline } from "@/server/services/pipelines";
import { addWorkspaceMember, createAgencyOwner, defaultPipeline } from "../support/factories";

describe("pipelines and opportunities", () => {
  it("seeds a default pipeline for new workspaces", async () => {
    const { ctx } = await createAgencyOwner();
    const pipelines = await listPipelines(ctx);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].stages.map((s) => s.name)).toEqual(["New Lead", "Contacted", "Qualified", "Proposal Sent", "Negotiation"]);
  });

  it("creates pipelines and edits stages (rename, reorder, add, remove)", async () => {
    const { ctx } = await createAgencyOwner();
    const p = await createPipeline(ctx, { name: "Onboarding", stages: [{ name: "Kickoff" }, { name: "Setup" }, { name: "Live" }] });
    const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: p.id }, orderBy: { position: "asc" } });

    await updatePipeline(ctx, p.id, {
      name: "Client Onboarding",
      stages: [{ id: stages[2].id, name: "Launched", probability: 100 }, { id: stages[0].id, name: "Kickoff" }, { name: "Review" }],
    });
    const after = await prisma.pipelineStage.findMany({ where: { pipelineId: p.id }, orderBy: { position: "asc" } });
    expect(after.map((s) => s.name)).toEqual(["Launched", "Kickoff", "Review"]);
    expect(after[0].probability).toBe(100);
    await expect(createPipeline(ctx, { name: "client onboarding", stages: [{ name: "x" }] })).resolves.toBeTruthy(); // names are case-sensitive unique
    await expect(createPipeline(ctx, { name: "Client Onboarding", stages: [{ name: "x" }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("creates opportunities, moves them across stages, and computes totals", async () => {
    const { ctx } = await createAgencyOwner();
    const pipeline = await defaultPipeline(ctx.workspaceId);
    const contact = await createContact(ctx, { firstName: "Buyer" });
    const [s0, s1] = pipeline.stages;

    const a = await createOpportunity(ctx, { name: "Retainer", pipelineId: pipeline.id, stageId: s0.id, contactId: contact.id, valueCents: "3000" });
    await createOpportunity(ctx, { name: "Website", pipelineId: pipeline.id, stageId: s0.id, valueCents: "1000.50" });

    let board = await getPipelineBoard(ctx, pipeline.id);
    expect(board.totals.openValueCents).toBe(400050);
    expect(board.totals.stages[0].count).toBe(2);

    await moveOpportunityStage(ctx, { opportunityId: a.id, stageId: s1.id });
    board = await getPipelineBoard(ctx, pipeline.id);
    expect(board.totals.stages[0].count).toBe(1);
    expect(board.totals.stages[1].openValueCents).toBe(300000);
    // Weighted: 1000.50 * 10% + 3000 * 20%
    expect(board.totals.weightedValueCents).toBe(Math.round(100050 * 0.1) + 300000 * 0.2);

    const activity = await prisma.activity.findFirstOrThrow({ where: { opportunityId: a.id, type: "opportunity.stage_changed" } });
    expect(activity.metadata).toMatchObject({ from: "New Lead", to: "Contacted" });
    expect(activity.contactId).toBe(contact.id); // visible on the contact timeline too

    await setOpportunityStatus(ctx, a.id, "WON");
    board = await getPipelineBoard(ctx, pipeline.id);
    expect(board.totals.wonValueCents).toBe(300000);
    expect(board.opportunities.map((o) => o.name)).toEqual(["Website"]); // default board shows open only
  });

  it("rejects moving an opportunity into another pipeline's stage", async () => {
    const { ctx } = await createAgencyOwner();
    const main = await defaultPipeline(ctx.workspaceId);
    const other = await createPipeline(ctx, { name: "Other", stages: [{ name: "Only" }] });
    const otherStage = await prisma.pipelineStage.findFirstOrThrow({ where: { pipelineId: other.id } });
    const opp = await createOpportunity(ctx, { name: "Deal", pipelineId: main.id, stageId: main.stages[0].id });

    await expect(moveOpportunityStage(ctx, { opportunityId: opp.id, stageId: otherStage.id })).rejects.toMatchObject({ code: "VALIDATION" });
    // Database composite FK also refuses a mismatched stage/pipeline pair.
    await expect(prisma.opportunity.update({ where: { id: opp.id }, data: { stageId: otherStage.id } })).rejects.toThrow();
    // Changing pipeline + stage together through the service is allowed.
    await expect(updateOpportunity(ctx, opp.id, { name: "Deal", pipelineId: other.id, stageId: otherStage.id })).resolves.toMatchObject({ pipelineId: other.id });
  });

  it("blocks removing stages or pipelines that still hold opportunities", async () => {
    const { ctx } = await createAgencyOwner();
    const pipeline = await defaultPipeline(ctx.workspaceId);
    await createOpportunity(ctx, { name: "Deal", pipelineId: pipeline.id, stageId: pipeline.stages[0].id });
    await expect(
      updatePipeline(ctx, pipeline.id, { name: pipeline.name, stages: pipeline.stages.slice(1).map((s) => ({ id: s.id, name: s.name })) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deletePipeline(ctx, pipeline.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.pipelineStage.count({ where: { pipelineId: pipeline.id } })).toBe(5);
  });

  it("restricts pipeline management and opportunity deletion to admins", async () => {
    const owner = await createAgencyOwner();
    const member = await addWorkspaceMember(owner.workspace.id, "MEMBER");
    const pipeline = await defaultPipeline(owner.workspace.id);
    await expect(createPipeline(member.ctx, { name: "Mine", stages: [{ name: "A" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const opp = await createOpportunity(member.ctx, { name: "Deal", pipelineId: pipeline.id, stageId: pipeline.stages[0].id });
    await setOpportunityArchived(member.ctx, opp.id, true);
    await expect(deleteOpportunity(member.ctx, opp.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteOpportunity(owner.ctx, opp.id);
    expect(await prisma.opportunity.count()).toBe(0);
  });

  it("rejects foreign stage ids without applying any change", async () => {
    const { ctx } = await createAgencyOwner();
    const pipeline = await defaultPipeline(ctx.workspaceId);
    const before = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { position: "asc" } });
    await expect(
      updatePipeline(ctx, pipeline.id, { name: "Renamed", stages: [{ id: before[0].id, name: "Renamed stage" }, { id: "not-a-real-id", name: "X" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const after = await prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id }, include: { stages: true } });
    expect(after.name).toBe(pipeline.name);
    expect(after.stages.find((s) => s.id === before[0].id)?.name).toBe(before[0].name);
  });
});
