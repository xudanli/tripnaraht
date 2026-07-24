/**
 * Slice 3 E6 — execution slip repair candidates (three types only).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { ExecutionSlipImpactResult } from '../detection/execution-slip-impact-analyzer';
import {
  EXECUTION_SLIP_CANDIDATE_IDS,
  type PoiExecutionWindow,
} from '../contracts/execution-slip.types';
import {
  computeProjectedEta,
  isScheduleFeasibleAfterRepair,
} from '../assessment/execution-slip-assessor.util';
import { buildRepairCandidate } from './repair-candidate.adapter';
import { readSegmentItineraryItemId } from '../detection/segment-plan-item.util';

export const EXECUTION_SUBSTITUTE_POI_ID = 'poi_nearby_substitute';

export function buildExecutionSlipRepairCandidates(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: ExecutionSlipImpactResult;
  evidenceRefs?: string[];
}): Rfc001RepairCandidate[] {
  const { impact, problem } = input;
  const nextWindow = impact.nextWindow;
  if (!nextWindow?.lastEntryAt || !impact.assessment.infeasible) {
    return [];
  }

  const candidates: Rfc001RepairCandidate[] = [];
  const shorten = buildShortenCandidate(input);
  if (shorten) candidates.push(shorten);

  candidates.push(buildRemoveNextCandidate(input));
  candidates.push(buildSubstituteNextCandidate(input));

  return candidates;
}

function buildShortenCandidate(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: ExecutionSlipImpactResult;
  evidenceRefs?: string[];
  remainingStayMinutes?: number;
  observedAt?: string;
}): Rfc001RepairCandidate | null {
  const { impact, problem } = input;
  const nextWindow = impact.nextWindow!;
  const delta = impact.shortenDeltaMinutes;
  const remainingStay = input.remainingStayMinutes ?? delta;
  const observedAt =
    input.observedAt ??
    impact.assessment.projectedEta ??
    new Date().toISOString();

  const feasible = evaluateShortenCandidateFeasible({
    observationAt: observedAt,
    remainingStayMinutes: remainingStay,
    shortenMinutes: delta,
    travelDurationMinutes: impact.travelDurationMinutes,
    nextWindow,
  });

  if (!feasible) {
    return null;
  }

  return buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY,
    basePlanVersionId: problem.planVersionId,
    replacesPlanItemIds: [impact.currentActivityId],
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.82,
    estimatedAddedDurationMinutes: -delta,
    preservedIntentRefs: ['intent_current_poi_shortened'],
    evidenceRefs: input.evidenceRefs,
    operations: [
      {
        operationId: 'op_shorten_current',
        kind: 'SHIFT_TIME',
        targetRefs: [{ kind: 'PLAN_ITEM', id: impact.currentActivityId }],
        parameters: {
          itineraryItemId: impact.currentActivityId,
          deltaMinutes: -delta,
          action: 'SHORTEN_CURRENT_STAY',
        },
      },
    ],
  });
}

function buildRemoveNextCandidate(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: ExecutionSlipImpactResult;
  evidenceRefs?: string[];
}): Rfc001RepairCandidate {
  const { impact, problem } = input;
  return buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
    basePlanVersionId: problem.planVersionId,
    replacesPlanItemIds: [impact.nextActivityId],
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.65,
    estimatedAddedDurationMinutes: 0,
    preservedIntentRefs: ['intent_schedule_recovery'],
    evidenceRefs: input.evidenceRefs,
    operations: [
      {
        operationId: 'op_remove_next',
        kind: 'REMOVE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: impact.nextActivityId }],
        parameters: {
          itineraryItemId: impact.nextActivityId,
          action: 'REMOVE_NEXT_ACTIVITY',
        },
      },
    ],
  });
}

function buildSubstituteNextCandidate(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: ExecutionSlipImpactResult;
  evidenceRefs?: string[];
}): Rfc001RepairCandidate {
  const { impact, problem } = input;
  return buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY,
    basePlanVersionId: problem.planVersionId,
    replacesPlanItemIds: [impact.nextActivityId],
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.75,
    estimatedAddedDurationMinutes: 0,
    preservedIntentRefs: ['intent_substitute_nearby'],
    evidenceRefs: input.evidenceRefs,
    operations: [
      {
        operationId: 'op_substitute_next',
        kind: 'REPLACE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: impact.nextActivityId }],
        parameters: {
          itineraryItemId: impact.nextActivityId,
          substitutePoiId: EXECUTION_SUBSTITUTE_POI_ID,
          action: 'SUBSTITUTE_NEXT_ACTIVITY',
        },
      },
    ],
  });
}

export function planForExecutionSlipCandidate(
  base: RoutePlanDraft,
  candidateId: string,
  impact: ExecutionSlipImpactResult,
): RoutePlanDraft {
  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY) {
    return {
      ...base,
      segments: (base.segments ?? []).filter((segment) => {
        const itemId = readSegmentItineraryItemId(segment as any);
        return itemId !== impact.nextActivityId;
      }),
    };
  }

  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY) {
    return {
      ...base,
      segments: (base.segments ?? []).map((segment) => {
        const itemId = readSegmentItineraryItemId(segment as any);
        if (itemId === impact.nextActivityId) {
          return {
            ...segment,
            metadata: {
              ...(segment.metadata as object),
              substitutePoiId: EXECUTION_SUBSTITUTE_POI_ID,
              lastEntryAt: '18:00',
            },
          };
        }
        return segment;
      }),
    };
  }

  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY) {
    return {
      ...base,
      segments: (base.segments ?? []).map((segment) => {
        const itemId = readSegmentItineraryItemId(segment as any);
        if (itemId === impact.currentActivityId) {
          return {
            ...segment,
            metadata: {
              ...(segment.metadata as object),
              shortened: true,
              shortenDeltaMinutes: impact.shortenDeltaMinutes,
            },
          };
        }
        return segment;
      }),
    };
  }

  return base;
}

export function evaluateShortenCandidateFeasible(input: {
  observationAt: string;
  remainingStayMinutes: number;
  shortenMinutes: number;
  travelDurationMinutes: number;
  nextWindow: PoiExecutionWindow;
}): boolean {
  const projectedEta = computeProjectedEta({
    observedAt: input.observationAt,
    remainingStayMinutes: Math.max(
      0,
      input.remainingStayMinutes - input.shortenMinutes,
    ),
    travelDurationMinutes: input.travelDurationMinutes,
  });
  return isScheduleFeasibleAfterRepair({
    projectedEta,
    lastEntryAt: input.nextWindow.lastEntryAt,
    timezone: input.nextWindow.timezone,
    referenceDateIso: input.observationAt,
  });
}
