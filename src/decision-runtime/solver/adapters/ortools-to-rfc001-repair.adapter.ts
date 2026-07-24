/**
 * SolverCandidate → Rfc001RepairCandidate (shadow proposal ops).
 * Actor stamped via generationMethod; never writes Effective Plan.
 */

import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { Rfc001RepairCandidate } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { PlanOperation } from '../../../trips/guardian-decision-core/contracts/plan-operation.types';
import type { SolverCandidate } from '../contracts/solver-response';
import { applySolverCandidateToRoutePlan } from '../materialize/apply-day-order-to-route-plan.util';
import { resolveAffectedDayIndex } from '../projection/build-solver-problem-from-route-plan.util';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import {
  applyMoveDayCandidateToRoutePlan,
  buildMoveDayRfc001Operations,
} from './ortools-move-day-projection.util';

const GENERATOR_VERSION = 'ortools-repair-shadow-0.2.0';

function opsForCandidate(
  cand: SolverCandidate,
  dayIndex: number,
  affectedPlanItemIds: string[],
): PlanOperation[] {
  if (cand.operation === 'MOVE_DAY') {
    return buildMoveDayRfc001Operations(cand);
  }

  const orderedNodeIds = cand.dayPlans[0]?.nodeIds ?? [];
  const ops: PlanOperation[] = [];
  const removed = cand.diffHint?.removedActivityIds ?? [];
  const added = cand.diffHint?.addedPoiIds ?? [];

  for (const id of removed) {
    if (added.length) {
      ops.push({
        operationId: `op_${cand.candidateId}_replace_${id}`,
        kind: 'REPLACE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id }],
        parameters: {
          itineraryItemId: id,
          substitutePoiId: added[0],
          dayIndex,
          source: 'ortools_routing',
          operation: cand.operation,
        },
      });
    } else {
      ops.push({
        operationId: `op_${cand.candidateId}_remove_${id}`,
        kind: 'REMOVE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id }],
        parameters: {
          itineraryItemId: id,
          dayIndex,
          source: 'ortools_routing',
          operation: cand.operation,
        },
      });
    }
  }

  if (cand.operation === 'SHORTEN' && cand.diffHint?.shiftedActivityIds?.length) {
    for (const id of cand.diffHint.shiftedActivityIds) {
      ops.push({
        operationId: `op_${cand.candidateId}_shift_${id}`,
        kind: 'SHIFT_TIME',
        targetRefs: [{ kind: 'PLAN_ITEM', id }],
        parameters: {
          itineraryItemId: id,
          dayIndex,
          shortenFactor: 0.75,
          source: 'ortools_routing',
          operation: 'SHORTEN',
        },
      });
    }
  }

  ops.push({
    operationId: `op_${cand.candidateId}_reorder`,
    kind: 'MOVE_ITEM',
    targetRefs: affectedPlanItemIds.map((id) => ({
      kind: 'PLAN_ITEM' as const,
      id,
    })),
    parameters: {
      dayIndex,
      orderedNodeIds,
      source: 'ortools_routing',
      operation: cand.operation,
    },
  });

  return ops;
}

export function buildOrtToolsRfc001RepairCandidates(input: {
  workspaceId: string;
  basePlanVersionId: string;
  basePlan: RoutePlanDraft;
  impact: RoadCloseImpactResult;
  candidates: SolverCandidate[];
  evidenceRefs?: string[];
}): Rfc001RepairCandidate[] {
  const dayIndex = resolveAffectedDayIndex(input.basePlan, input.impact);
  return input.candidates.map((cand, idx) => {
    return {
      candidateId: cand.candidateId || `ortools_swap_${idx}`,
      workspaceId: input.workspaceId,
      actor: 'NEPTUNE',
      basePlanVersionId: input.basePlanVersionId,
      replacesPlanItemIds: input.impact.affectedPlanItemIds,
      proposedOperations: opsForCandidate(
        cand,
        dayIndex,
        input.impact.affectedPlanItemIds,
      ),
      preservedIntentRefs: ['intent_glacier'],
      degradedIntentRefs: [],
      lostIntentRefs: [],
      estimatedIntentPreservation:
        cand.operation === 'REPLACE'
          ? 0.7
          : cand.operation === 'SHORTEN'
            ? 0.8
            : cand.operation === 'MOVE_DAY'
              ? 0.75
              : 0.85,
      estimatedAddedCost: { amount: 0, currency: 'ISK' },
      estimatedAddedDurationMinutes: Math.max(
        0,
        Math.round((cand.objectiveValue ?? 0) / 10),
      ),
      generationMethod: 'ROUTE_REPAIR',
      evidenceRefs: input.evidenceRefs ?? [],
      generatorVersion: GENERATOR_VERSION,
      status: 'PROPOSED',
      createdAt: new Date().toISOString(),
    };
  });
}

export function materializeOrtToolsCandidatePlan(
  base: RoutePlanDraft,
  candidate: SolverCandidate,
  impact: RoadCloseImpactResult,
): RoutePlanDraft {
  if (candidate.operation === 'MOVE_DAY') {
    return applyMoveDayCandidateToRoutePlan(base, candidate);
  }
  const dayIndex = resolveAffectedDayIndex(base, impact);
  return applySolverCandidateToRoutePlan(base, candidate, dayIndex);
}
