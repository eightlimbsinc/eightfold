/** Pure pipeline aggregation helpers (unit tested). */
export interface OpportunityLike {
  stageId: string;
  valueCents: number;
  status: "OPEN" | "WON" | "LOST";
}

export interface StageLike {
  id: string;
  name: string;
  position: number;
  probability: number | null;
}

export interface StageTotals {
  stageId: string;
  count: number;
  openValueCents: number;
  weightedValueCents: number;
}

export interface PipelineTotals {
  stages: StageTotals[];
  openCount: number;
  openValueCents: number;
  weightedValueCents: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
}

/**
 * Aggregates opportunities per stage. Only OPEN opportunities contribute to
 * open and weighted value; stage counts include every non-archived
 * opportunity currently in the stage so the board matches what users see.
 */
export function computePipelineTotals(stages: StageLike[], opportunities: OpportunityLike[]): PipelineTotals {
  const byStage = new Map<string, StageTotals>(
    stages.map((s) => [s.id, { stageId: s.id, count: 0, openValueCents: 0, weightedValueCents: 0 }]),
  );
  const probability = new Map(stages.map((s) => [s.id, s.probability]));
  const totals: PipelineTotals = {
    stages: [],
    openCount: 0,
    openValueCents: 0,
    weightedValueCents: 0,
    wonCount: 0,
    wonValueCents: 0,
    lostCount: 0,
  };

  for (const opp of opportunities) {
    const stage = byStage.get(opp.stageId);
    if (stage) stage.count += 1;
    if (opp.status === "OPEN") {
      const weight = probability.get(opp.stageId);
      const weighted = Math.round((opp.valueCents * (weight ?? 100)) / 100);
      totals.openCount += 1;
      totals.openValueCents += opp.valueCents;
      totals.weightedValueCents += weighted;
      if (stage) {
        stage.openValueCents += opp.valueCents;
        stage.weightedValueCents += weighted;
      }
    } else if (opp.status === "WON") {
      totals.wonCount += 1;
      totals.wonValueCents += opp.valueCents;
    } else {
      totals.lostCount += 1;
    }
  }

  totals.stages = [...stages].sort((a, b) => a.position - b.position).map((s) => byStage.get(s.id)!);
  return totals;
}

/**
 * Plans a stage list update: which stages to create, update (rename/reorder)
 * or delete, given the existing stages and the desired ordered list.
 */
export function planStageChanges(
  existing: Array<{ id: string }>,
  desired: Array<{ id?: string; name: string; probability?: number }>,
) {
  const existingIds = new Set(existing.map((s) => s.id));
  const keptIds = new Set(desired.filter((d) => d.id && existingIds.has(d.id)).map((d) => d.id!));
  return {
    create: desired
      .map((d, position) => ({ ...d, position }))
      .filter((d) => !d.id || !existingIds.has(d.id))
      .map(({ name, probability, position }) => ({ name, probability: probability ?? null, position })),
    update: desired
      .map((d, position) => ({ ...d, position }))
      .filter((d) => d.id && existingIds.has(d.id))
      .map(({ id, name, probability, position }) => ({ id: id!, name, probability: probability ?? null, position })),
    remove: existing.filter((s) => !keptIds.has(s.id)).map((s) => s.id),
  };
}
