/**
 * Build DecisionWorkspace materials from planning candidates + constraint reports.
 */

import { randomUUID } from 'crypto';
import type { DecisionWorkspace } from '../../trips/guardian-decision-core/contracts/decision-workspace.types';
import type {
  Rfc001LoadAssessment,
  Rfc001RepairCandidate,
} from '../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import { mapCanonicalAssertionsToGuardianBatch } from '../adapters/canonical-to-guardian.mapper';
import type { DecisionCandidate, PlanningContext } from '../candidates/contracts/decision-candidate';
import type { PlanOperation } from '../../trips/guardian-decision-core/contracts/plan-operation.types';
import { resolveBaseCandidateId } from '../candidates/map-plan-variant.util';
import { tripPlanToMaterializeOperations } from './trip-plan-to-materialize-operations.util';
import { ORIGINAL_CANDIDATE_ID } from '../../trips/guardian-decision-core/adapters/repair-candidate.adapter';

export function buildFullPlanDecisionWorkspace(input: {
  problemId: string;
  context: PlanningContext;
  candidates: DecisionCandidate[];
  constraintReportsByCandidateId: Record<string, CanonicalConstraintReport>;
}): { workspace: DecisionWorkspace; baseCandidateId: string } {
  const workspaceId = `ws_full_plan_${randomUUID()}`;
  const materializeFromTripPlan = input.context.materializeFromTripPlan === true;
  const baseCandidateId = materializeFromTripPlan
    ? ORIGINAL_CANDIDATE_ID
    : resolveBaseCandidateId(input.candidates);
  const now = new Date().toISOString();
  const tripId = input.context.tripId;

  const constraintAssertions = input.candidates.flatMap((candidate) => {
    const report = input.constraintReportsByCandidateId[candidate.candidateId];
    if (!report) return [];
    return mapCanonicalAssertionsToGuardianBatch({
      assertions: report.assertions,
      workspaceId,
      targetCandidateId: candidate.candidateId,
    });
  });

  const loadAssessments = input.candidates
    .filter((c) => materializeFromTripPlan || c.candidateId !== baseCandidateId)
    .map((c) => mapCandidateToLoadAssessment(c, workspaceId));

  const repairSourceCandidates = materializeFromTripPlan
    ? input.candidates
    : input.candidates.filter((c) => c.candidateId !== baseCandidateId);

  const repairCandidates = repairSourceCandidates.map((c) =>
    mapCandidateToRepairCandidate(
      c,
      workspaceId,
      input.context.basePlanVersionId ?? 'plan_draft',
      materializeFromTripPlan
        ? tripPlanToMaterializeOperations({ plan: c.plan, tripId })
        : [],
    ),
  );

  const workspace: DecisionWorkspace = {
    workspaceId,
    problemId: input.problemId,
    basePlanVersionId: input.context.basePlanVersionId ?? 'plan_draft',
    worldStateSnapshotId: input.context.worldStateSnapshotId ?? `ws_snap_${input.context.tripId}`,
    preferenceSnapshotId: input.context.preferenceSnapshotId ?? `pref_${input.context.tripId}`,
    constraintAssertions,
    loadAssessments,
    repairCandidates,
    createdAt: now,
    revision: 1,
    status: 'READY_FOR_FINALIZE',
  };

  return { workspace, baseCandidateId };
}

function mapCandidateToLoadAssessment(
  candidate: DecisionCandidate,
  workspaceId: string,
): Rfc001LoadAssessment {
  const score = candidate.legacyVariant?.score.breakdown;
  const physicalLoad = score ? Math.min(1, score.violationRisk) : 0.35;
  const scheduleStress = score ? Math.min(1, 1 - score.robustness) : 0.35;

  return {
    assessmentId: `load_${candidate.candidateId}_${randomUUID()}`,
    workspaceId,
    actor: 'DRDRE',
    targetCandidateId: candidate.candidateId,
    affectedTravelerIds: [],
    physicalLoad,
    scheduleStress,
    recoveryDeficit: Math.max(0, physicalLoad - 0.5),
    adjustmentRequirements: [],
    modelVersion: 'legacy-plan-variant-score@v1',
    inputSnapshotRef: `candidate:${candidate.candidateId}`,
    confidence: 0.75,
    createdAt: new Date().toISOString(),
  };
}

function mapCandidateToRepairCandidate(
  candidate: DecisionCandidate,
  workspaceId: string,
  basePlanVersionId: string,
  proposedOperations: PlanOperation[] = [],
): Rfc001RepairCandidate {
  const preservation = candidate.legacyVariant?.score.breakdown.satisfaction ?? 0.7;
  const costPenalty = candidate.legacyVariant?.score.breakdown.cost ?? 0.2;

  return {
    candidateId: candidate.candidateId,
    workspaceId,
    actor: 'NEPTUNE',
    basePlanVersionId,
    replacesPlanItemIds: [],
    proposedOperations,
    preservedIntentRefs: [],
    degradedIntentRefs: [],
    lostIntentRefs: [],
    estimatedIntentPreservation: preservation,
    estimatedAddedCost: {
      amount: Math.round(costPenalty * 1000),
      currency: 'USD',
    },
    estimatedAddedDurationMinutes: 0,
    generationMethod: 'TEMPLATE',
    evidenceRefs: [],
    generatorVersion: 'legacy-trip-planning@v1',
    status: 'VALID',
    createdAt: new Date().toISOString(),
  };
}
