/**
 * Verifies multi-step writes are atomic: when a later step inside the
 * transaction fails, earlier writes are rolled back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const failure = vi.hoisted(() => ({ on: false }));
vi.mock("@/server/services/activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/activity")>();
  return {
    ...actual,
    recordActivity: vi.fn(async (...args: Parameters<typeof actual.recordActivity>) => {
      if (failure.on) throw new Error("simulated activity failure");
      return actual.recordActivity(...args);
    }),
  };
});

import { prisma } from "@/server/db";
import { createContact } from "@/server/services/contacts";
import { createOpportunity, moveOpportunityStage } from "@/server/services/opportunities";
import { createTag } from "@/server/services/tags";
import { createAgencyOwner, defaultPipeline } from "../support/factories";

afterEach(() => {
  failure.on = false;
});

describe("transaction handling", () => {
  it("does not persist a contact, its tags or field values when a later step fails", async () => {
    const { ctx } = await createAgencyOwner();
    const tag = await createTag(ctx, { name: "VIP" });
    failure.on = true;
    await expect(createContact(ctx, { firstName: "Atomic", tagIds: [tag.id] })).rejects.toThrow("simulated");
    expect(await prisma.contact.count()).toBe(0);
    expect(await prisma.contactTag.count()).toBe(0);
  });

  it("does not move an opportunity when recording the stage change fails", async () => {
    const { ctx } = await createAgencyOwner();
    const pipeline = await defaultPipeline(ctx.workspaceId);
    const opp = await createOpportunity(ctx, { name: "Deal", pipelineId: pipeline.id, stageId: pipeline.stages[0].id });
    failure.on = true;
    await expect(moveOpportunityStage(ctx, { opportunityId: opp.id, stageId: pipeline.stages[2].id })).rejects.toThrow("simulated");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } })).stageId).toBe(pipeline.stages[0].id);
  });
});
