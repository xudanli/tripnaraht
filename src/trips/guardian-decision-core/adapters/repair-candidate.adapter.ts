/**
 * PR-C — Neptune / plan diff → Rfc001RepairCandidate (never effective plan).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { DecisionResult } from '../../decision/shared/decision-result.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { PlanOperation } from '../contracts/plan-operation.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';
import { assertNeptuneDoesNotDirectlyMutatePlan } from '../policy/write-permission.guard';

const NEPTUNE_GENERATOR_VERSION = 'neptune-rfc001-adapter-0.1.0';
export const ORIGINAL_CANDIDATE_ID = 'original';

export function applyProposedOperationsToPlan(
  base: RoutePlanDraft,
  operations: PlanOperation[],
): RoutePlanDraft {
  let segments = [...(base.segments ?? [])];
  for (const op of operations) {
    if (op.kind === 'REMOVE_ITEM' || op.kind === 'REPLACE_ITEM') {
      const removeId = op.parameters.itineraryItemId as string | undefined;
      if (removeId) {
        segments = segments.filter(
          (s) => (s.metadata as any)?.itineraryItemId !== removeId,
        );
      }
    }
    if (op.kind === 'CHANGE_ROUTE') {
      const segId = op.targetRefs[0]?.id;
      if (segId && op.parameters.bypassRoadId) {
        segments = segments.map((s) =>
          s.segmentId === segId
            ? {
                ...s,
                metadata: {
                  ...(s.metadata as object),
                  roadIds: [String(op.parameters.bypassRoadId)],
                  repaired: true,
                },
              }
            : s,
        );
      }
    }
    if (op.kind === 'MOVE_ITEM' && Array.isArray(op.parameters.orderedNodeIds)) {
      const dayIndex =
        typeof op.parameters.dayIndex === 'number' ? op.parameters.dayIndex : 0;
      const orderedNodeIds = op.parameters.orderedNodeIds as string[];
      const daySegs = segments.filter((s) => s.dayIndex === dayIndex);
      const others = segments.filter((s) => s.dayIndex !== dayIndex);
      const keyOf = (s: (typeof segments)[number]) => {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        return (
          (typeof meta.itineraryItemId === 'string' && meta.itineraryItemId) ||
          (typeof meta.poiId === 'string' && meta.poiId) ||
          s.segmentId
        );
      };
      const byKey = new Map(daySegs.map((s) => [keyOf(s), s]));
      const used = new Set<string>();
      const ordered: typeof segments = [];
      for (const nodeId of orderedNodeIds) {
        if (nodeId === 'depot') continue;
        const seg = byKey.get(nodeId);
        if (seg && !used.has(seg.segmentId)) {
          ordered.push({
            ...seg,
            metadata: { ...(seg.metadata as object), ortoolsReordered: true },
          });
          used.add(seg.segmentId);
        }
      }
      for (const s of daySegs) {
        if (!used.has(s.segmentId)) ordered.push(s);
      }
      segments = [...others, ...ordered];
    }
  }
  return { ...base, segments };
}

export function buildRepairCandidate(input: {
  workspaceId: string;
  candidateId: string;
  basePlanVersionId: string;
  replacesPlanItemIds: string[];
  operations: PlanOperation[];
  generationMethod: Rfc001RepairCandidate['generationMethod'];
  estimatedIntentPreservation: number;
  estimatedAddedDurationMinutes: number;
  preservedIntentRefs?: string[];
  evidenceRefs?: string[];
}): Rfc001RepairCandidate {
  return {
    candidateId: input.candidateId,
    workspaceId: input.workspaceId,
    actor: 'NEPTUNE',
    basePlanVersionId: input.basePlanVersionId,
    replacesPlanItemIds: input.replacesPlanItemIds,
    proposedOperations: input.operations,
    preservedIntentRefs: input.preservedIntentRefs ?? ['intent_glacier'],
    degradedIntentRefs: [],
    lostIntentRefs: [],
    estimatedIntentPreservation: input.estimatedIntentPreservation,
    estimatedAddedCost: { amount: 0, currency: 'ISK' },
    estimatedAddedDurationMinutes: input.estimatedAddedDurationMinutes,
    generationMethod: input.generationMethod,
    evidenceRefs: input.evidenceRefs ?? [],
    generatorVersion: NEPTUNE_GENERATOR_VERSION,
    status: 'PROPOSED',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Structural diverse repair stubs when full Neptune graph search is unavailable.
 */
export function buildRoadCloseStubCandidates(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: RoadCloseImpactResult;
  basePlan: RoutePlanDraft;
}): Rfc001RepairCandidate[] {
  const replaces = input.impact.affectedPlanItemIds;
  const primarySeg = input.impact.matchedSegmentIds[0];
  const basePlanVersionId = input.problem.planVersionId;

  const candA = buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: 'cand_a',
    basePlanVersionId,
    replacesPlanItemIds: replaces,
    generationMethod: 'ONTOLOGY_EQUIVALENCE',
    estimatedIntentPreservation: 0.92,
    estimatedAddedDurationMinutes: 20,
    preservedIntentRefs: ['intent_glacier'],
    operations: [
      {
        operationId: 'op_cand_a_replace',
        kind: 'REPLACE_ITEM',
        targetRefs: replaces.map((id) => ({
          kind: 'PLAN_ITEM',
          id,
        })),
        parameters: {
          itineraryItemId: replaces[0],
          substitutePoiId: 'poi_glacier_alt',
          intentRef: 'intent_glacier',
        },
      },
    ],
  });

  const candB = buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: 'cand_b',
    basePlanVersionId,
    replacesPlanItemIds: replaces,
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.84,
    estimatedAddedDurationMinutes: -10,
    preservedIntentRefs: ['intent_waterfall', 'intent_wilderness'],
    operations: [
      {
        operationId: 'op_cand_b_combo',
        kind: 'REPLACE_ITEM',
        targetRefs: replaces.map((id) => ({
          kind: 'PLAN_ITEM',
          id,
        })),
        parameters: {
          itineraryItemId: replaces[0],
          substitutePoiId: 'poi_waterfall_combo',
        },
      },
    ],
  });

  const candC = buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: 'cand_c',
    basePlanVersionId,
    replacesPlanItemIds: replaces,
    generationMethod: 'ROUTE_REPAIR',
    estimatedIntentPreservation: 0.95,
    estimatedAddedDurationMinutes: 90,
    preservedIntentRefs: ['intent_glacier', 'intent_wilderness'],
    operations: primarySeg
      ? [
          {
            operationId: 'op_cand_c_bypass',
            kind: 'CHANGE_ROUTE',
            targetRefs: [{ kind: 'ROUTE_SEGMENT', id: primarySeg }],
            parameters: {
              bypassRoadId: 'RING_ROAD',
              note: 'long detour — expected Abu BLOCK in validation',
            },
          },
        ]
      : [],
  });

  return [candA, candB, candC];
}

/**
 * Optional: derive a single candidate from legacy Neptune result without adopting updatedPlan.
 */
export function mapNeptuneResultToCandidate(input: {
  workspaceId: string;
  candidateId: string;
  basePlan: RoutePlanDraft;
  basePlanVersionId: string;
  replacesPlanItemIds: string[];
  result: DecisionResult;
}): Rfc001RepairCandidate | null {
  assertNeptuneDoesNotDirectlyMutatePlan({
    hasUpdatedPlan: false,
    source: 'repair-candidate-adapter',
  });

  if (!input.result.updatedPlan || input.result.action !== 'REPLACE') {
    return null;
  }

  // Materialize diff as operations only — do not return updatedPlan to callers.
  const _discarded = input.result.updatedPlan;
  void _discarded;

  return buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    basePlanVersionId: input.basePlanVersionId,
    replacesPlanItemIds: input.replacesPlanItemIds,
    generationMethod: 'LLM_ASSISTED',
    estimatedIntentPreservation: 0.88,
    estimatedAddedDurationMinutes: 15,
    operations: [
      {
        operationId: `op_${input.candidateId}_nep`,
        kind: 'CHANGE_ROUTE',
        targetRefs: input.basePlan.segments?.slice(0, 1).map((s) => ({
          kind: 'ROUTE_SEGMENT' as const,
          id: s.segmentId,
        })) ?? [],
        parameters: { source: 'neptune_strategy_diff' },
      },
    ],
    evidenceRefs: input.result.logs.flatMap((l) => l.evidenceRefs ?? []),
  });
}

export function planForCandidate(
  base: RoutePlanDraft,
  candidate: Rfc001RepairCandidate,
): RoutePlanDraft {
  if (candidate.candidateId === ORIGINAL_CANDIDATE_ID) return base;
  return applyProposedOperationsToPlan(base, candidate.proposedOperations);
}

/** @deprecated Use buildRoadCloseStubCandidates */
export const buildIcelandRoadCloseStubCandidates = buildRoadCloseStubCandidates;
