/**
 * PD-3 — Build / open RFC-001 DecisionProblem from ProactiveImpact (no parallel store).
 */

import type { EntityRef } from '../../guardian-decision-core/contracts/entity-ref.types';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import { PROACTIVE_IMPACT_SCHEMA_ID } from '../contracts/proactive-impact.types';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import { shouldOpenDecisionProblem } from '../orchestration/proactive-decision-orchestrator.types';
import {
  mapProactiveCaseToRfc001Binding,
  urgencyFromImpactLevel,
} from './proactive-case-rfc001-binding.util';

export type ProactiveProblemStorePort = {
  findOpenByTriggerEvent(
    tripId: string,
    triggerEventId: string,
  ): Promise<Rfc001DecisionProblem | undefined>;
  upsert(
    tripId: string,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionProblem>;
};

export type BuildProactiveRfc001ProblemInput = {
  impact: ProactiveImpactV1;
  planVersionId: string;
  worldStateSnapshotId: string;
  affectedEntityRefs?: EntityRef[];
  idempotencyKey: string;
  now?: string;
};

export function buildProactiveRfc001Problem(
  input: BuildProactiveRfc001ProblemInput,
): Rfc001DecisionProblem {
  if (!shouldOpenDecisionProblem(input.impact) || !input.impact.caseId) {
    throw new Error('[ProactiveDecision] cannot_build_problem_without_case');
  }

  const binding = mapProactiveCaseToRfc001Binding(input.impact.caseId);
  const refs: EntityRef[] =
    input.affectedEntityRefs ??
    input.impact.affectedItems.map((id, i) => ({
      kind: 'PLAN_ITEM' as const,
      id,
      label: input.impact.affectedItemLabels?.[i],
    }));

  const detectedAt = input.now ?? new Date().toISOString();
  const shortTrip = input.impact.tripId.slice(0, 8);

  return {
    problemId: `problem_pd_${input.impact.caseId}_${shortTrip}_${input.impact.signalEventId}`,
    tripId: input.impact.tripId,
    planVersionId: input.planVersionId,
    type: binding.type,
    triggerEventId: input.impact.signalEventId,
    semanticCapability: binding.semanticCapability,
    affectedEntityRefs: refs,
    affectedPlanItemIds: [...input.impact.affectedItems],
    worldStateSnapshotId: input.worldStateSnapshotId,
    detectedAt,
    urgency: urgencyFromImpactLevel(input.impact.impactLevel),
    status: 'OPEN',
    proactiveCaseId: input.impact.caseId,
    proactiveImpactSchemaId: PROACTIVE_IMPACT_SCHEMA_ID,
    proactiveIdempotencyKey: input.idempotencyKey,
  };
}

export type OpenProactiveDecisionProblemResult =
  | {
      opened: true;
      problem: Rfc001DecisionProblem;
      reusedExisting: boolean;
    }
  | {
      opened: false;
      reason: 'DECISION_NOT_REQUIRED';
    };

/**
 * Idempotent open against the existing RFC-001 problem store.
 */
export async function openProactiveDecisionProblem(
  store: ProactiveProblemStorePort,
  input: BuildProactiveRfc001ProblemInput,
): Promise<OpenProactiveDecisionProblemResult> {
  if (!shouldOpenDecisionProblem(input.impact)) {
    return { opened: false, reason: 'DECISION_NOT_REQUIRED' };
  }

  const existing = await store.findOpenByTriggerEvent(
    input.impact.tripId,
    input.impact.signalEventId,
  );
  if (existing) {
    const stamped: Rfc001DecisionProblem = {
      ...existing,
      proactiveCaseId: input.impact.caseId ?? existing.proactiveCaseId,
      proactiveImpactSchemaId: PROACTIVE_IMPACT_SCHEMA_ID,
      proactiveIdempotencyKey: input.idempotencyKey,
      semanticCapability:
        existing.semanticCapability ??
        (input.impact.caseId
          ? mapProactiveCaseToRfc001Binding(input.impact.caseId).semanticCapability
          : undefined),
    };
    const problem = await store.upsert(input.impact.tripId, stamped);
    return { opened: true, problem, reusedExisting: true };
  }

  const created = buildProactiveRfc001Problem(input);
  const problem = await store.upsert(input.impact.tripId, created);
  return { opened: true, problem, reusedExisting: false };
}
