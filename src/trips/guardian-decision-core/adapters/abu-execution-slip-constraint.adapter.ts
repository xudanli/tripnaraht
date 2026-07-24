/**
 * Slice 3 — Abu constraint evaluation for execution slip repair candidates.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { ExecutionSlipImpactResult } from '../detection/execution-slip-impact-analyzer';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { ExecutionDepartureAssertionPayload } from '../adapters/execution-departure-to-assertion.adapter';
import {
  EXECUTION_SLIP_CANDIDATE_IDS,
  EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY,
} from '../contracts/execution-slip.types';
import {
  computeProjectedEta,
  isScheduleFeasibleAfterRepair,
} from '../assessment/execution-slip-assessor.util';
import { ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import { planForExecutionSlipCandidate } from './execution-slip-repair-candidate.adapter';

export function evaluateAbuExecutionSlipConstraintForCandidate(input: {
  tripId: string;
  workspaceId: string;
  targetCandidateId: string;
  slipAssertion: WorldStateAssertion<ExecutionDepartureAssertionPayload>;
  impact: ExecutionSlipImpactResult;
  candidatePlan: RoutePlanDraft;
}): Rfc001ConstraintAssertion {
  const { targetCandidateId, impact, slipAssertion } = input;
  const nextWindow = impact.nextWindow;
  const observedAt = slipAssertion.payload.observedAt;

  let verdict: 'PASS' | 'BLOCK' | 'WARNING' = 'PASS';
  let reasonCodes = ['EXEC_SLIP_CANDIDATE_FEASIBLE'];

  if (targetCandidateId === ORIGINAL_CANDIDATE_ID) {
    verdict = impact.assessment.infeasible ? 'BLOCK' : 'PASS';
    reasonCodes = impact.assessment.infeasible
      ? ['EXEC_SLIP_ORIGINAL_INFEASIBLE']
      : ['EXEC_SLIP_ORIGINAL_OK'];
  } else if (
    targetCandidateId === EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY &&
    nextWindow
  ) {
    const projectedEta = computeProjectedEta({
      observedAt,
      remainingStayMinutes: Math.max(
        0,
        (impact.shortenDeltaMinutes > 0 ? 128 - impact.shortenDeltaMinutes : 0),
      ),
      travelDurationMinutes: impact.travelDurationMinutes,
    });
    const ok = isScheduleFeasibleAfterRepair({
      projectedEta,
      lastEntryAt: nextWindow.lastEntryAt,
      timezone: nextWindow.timezone,
      referenceDateIso: observedAt,
    });
    verdict = ok ? 'PASS' : 'BLOCK';
    reasonCodes = ok
      ? ['EXEC_SLIP_SHORTEN_FEASIBLE']
      : ['EXEC_SLIP_SHORTEN_STILL_LATE'];
  } else if (
    targetCandidateId === EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY
  ) {
    verdict = 'PASS';
    reasonCodes = ['EXEC_SLIP_REMOVE_NEXT_OK'];
  } else if (
    targetCandidateId === EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY
  ) {
    verdict = 'PASS';
    reasonCodes = ['EXEC_SLIP_SUBSTITUTE_OK'];
  }

  return {
    assertionId: `abu_exec_slip_${targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId,
    affectedEntityRefs: impact.affectedEntityRefs,
    affectedPlanItemIds: impact.affectedPlanItemIds,
    verdict,
    constraintCode: 'EXECUTION_SCHEDULE_FEASIBILITY',
    reasonCodes,
    evidenceRefs: slipAssertion.source.evidenceRefs,
    ruleVersion: 'abu-exec-slip-0.1.0',
    confidence: 0.9,
    overridable: false,
    semanticKey: EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY,
    createdAt: new Date().toISOString(),
  };
}

export function buildCandidatePlanForExecutionSlip(
  base: RoutePlanDraft,
  candidateId: string,
  impact: ExecutionSlipImpactResult,
): RoutePlanDraft {
  if (candidateId === ORIGINAL_CANDIDATE_ID) return base;
  return planForExecutionSlipCandidate(base, candidateId, impact);
}
