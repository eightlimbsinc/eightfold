import { describe, expect, it } from "vitest";
import { computePipelineTotals, planStageChanges } from "@/lib/pipeline-math";

const stages = [
  { id: "s2", name: "Proposal", position: 1, probability: 50 },
  { id: "s1", name: "New", position: 0, probability: null },
];

describe("computePipelineTotals", () => {
  it("sums open value per stage and weights by probability", () => {
    const totals = computePipelineTotals(stages, [
      { stageId: "s1", valueCents: 10_000, status: "OPEN" },
      { stageId: "s2", valueCents: 20_000, status: "OPEN" },
      { stageId: "s2", valueCents: 5_000, status: "WON" },
      { stageId: "s2", valueCents: 7_000, status: "LOST" },
    ]);
    expect(totals.openCount).toBe(2);
    expect(totals.openValueCents).toBe(30_000);
    // s1 has no probability (counts 100%), s2 is 50%
    expect(totals.weightedValueCents).toBe(10_000 + 10_000);
    expect(totals.wonCount).toBe(1);
    expect(totals.wonValueCents).toBe(5_000);
    expect(totals.lostCount).toBe(1);
    expect(totals.stages.map((s) => s.stageId)).toEqual(["s1", "s2"]);
    expect(totals.stages[1]).toEqual({ stageId: "s2", count: 3, openValueCents: 20_000, weightedValueCents: 10_000 });
  });

  it("handles empty pipelines", () => {
    const totals = computePipelineTotals(stages, []);
    expect(totals.openValueCents).toBe(0);
    expect(totals.stages.every((s) => s.count === 0)).toBe(true);
  });
});

describe("planStageChanges", () => {
  it("computes creates, updates with new positions, and removals", () => {
    const plan = planStageChanges([{ id: "a" }, { id: "b" }, { id: "c" }], [
      { id: "c", name: "C" },
      { name: "New" },
      { id: "a", name: "A renamed", probability: 30 },
    ]);
    expect(plan.update).toEqual([
      { id: "c", name: "C", probability: null, position: 0 },
      { id: "a", name: "A renamed", probability: 30, position: 2 },
    ]);
    expect(plan.create).toEqual([{ name: "New", probability: null, position: 1 }]);
    expect(plan.remove).toEqual(["b"]);
  });

  it("treats unknown ids as new stages", () => {
    const plan = planStageChanges([{ id: "a" }], [{ id: "zzz", name: "X" }]);
    expect(plan.create).toHaveLength(1);
    expect(plan.remove).toEqual(["a"]);
  });
});
