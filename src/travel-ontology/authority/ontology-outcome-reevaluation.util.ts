import {
  buildConstraintAssessment,
  invalidateAssessment,
} from '../contracts/build-constraint-assessment';
import type { ActionProposal, FactMutation, PlanMutation } from '../contracts/action-proposal.types';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import { evaluateOntologyConstraints } from '../evaluators/ontology-constraint.evaluator';
import { withAffectedGates } from './resolve-gate-status-from-assessments.util';
import { recordAuthorityConsumptionTrace } from './record-authority-consumption-trace.util';

export const ONTOLOGY_OUTCOME_EVENT_SCHEMA_ID = 'tripnara.ontology_outcome_event@v1' as const;

export interface OntologyOutcomeEventV1 {
  schemaId: typeof ONTOLOGY_OUTCOME_EVENT_SCHEMA_ID;
  outcomeEventId: string;
  actionId: string;
  sourceAssessmentId: string;
  contextId: string;
  basedOnRevision: number;
  authorityRunId: string;
  result: 'APPLIED' | 'REJECTED' | 'FAILED';
  changedPlanVersion?: string;
  changedFactIds: string[];
  invalidatedAssessmentIds: string[];
  reevaluationAssessmentId: string;
  reevaluationOutcome: ConstraintAssessment['outcome'];
  occurredAt: string;
}

export function resolveInvalidatedAssessments(input: {
  planChanges: PlanMutation[];
  factChanges: FactMutation[];
  newPlanVersion?: string;
  previousPlanVersion?: string;
  activeAssessments: ConstraintAssessment[];
  changedFactIds?: string[];
}): ConstraintAssessment[] {
  const changedFacts = new Set([
    ...(input.changedFactIds ?? []),
    ...input.factChanges.map((f) => f.factId),
    ...input.factChanges.map((f) => f.nextFactId).filter((x): x is string => !!x),
  ]);
  const planChanged =
    input.planChanges.length > 0 ||
    (input.newPlanVersion != null &&
      input.previousPlanVersion != null &&
      input.newPlanVersion !== input.previousPlanVersion);

  return input.activeAssessments.filter((a) => {
    if (
      a.invalidated ||
      a.lifecycleStatus === 'INVALIDATED' ||
      a.lifecycleStatus === 'SUPERSEDED'
    ) {
      return false;
    }
    if (planChanged && a.basis.effectivePlanVersion) {
      if (!input.newPlanVersion || a.basis.effectivePlanVersion !== input.newPlanVersion) {
        return true;
      }
    }
    if (changedFacts.size > 0 && a.factRefs.some((id) => changedFacts.has(id))) {
      return true;
    }
    return false;
  });
}

export function markAssessmentsInvalidated(
  assessments: ConstraintAssessment[],
  input: { actionId: string; supersededByAssessmentId?: string },
): ConstraintAssessment[] {
  return assessments.map((a) => ({
    ...invalidateAssessment(a, {
      actionId: input.actionId,
      supersededByAssessmentId: input.supersededByAssessmentId ?? a.assessmentId,
    }),
    lifecycleStatus: input.supersededByAssessmentId ? 'SUPERSEDED' : 'INVALIDATED',
  }));
}

export function runOntologyOutcomeReevaluation(input: {
  action: ActionProposal;
  sourceAssessment: ConstraintAssessment;
  factsAfter: TravelWorldFact[];
  contextId: string;
  authorityRunId: string;
  changedPlanVersion?: string;
  result?: 'APPLIED' | 'REJECTED' | 'FAILED';
  occurredAt?: string;
}): {
  outcomeEvent: OntologyOutcomeEventV1;
  invalidated: ConstraintAssessment[];
  nextAssessment: ConstraintAssessment;
} {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const evaluation = evaluateOntologyConstraints(input.factsAfter);
  const nextAssessment = withAffectedGates(
    buildConstraintAssessment({
      facts: input.factsAfter,
      evaluation,
      tripId: input.sourceAssessment.affectedScopes[0]?.tripId,
      contextId: input.contextId,
      basis: {
        contextRevision: input.action.basedOnRevision + 1,
        effectivePlanVersion:
          input.changedPlanVersion ?? input.sourceAssessment.basis.effectivePlanVersion,
        destinationPackVersion: input.sourceAssessment.basis.destinationPackVersion,
      },
      evaluatedAt: occurredAt,
    }),
  );

  const toInvalidate = resolveInvalidatedAssessments({
    planChanges: input.action.expectedDelta.planMutations,
    factChanges: input.action.expectedDelta.factMutations,
    newPlanVersion: input.changedPlanVersion,
    previousPlanVersion: input.sourceAssessment.basis.effectivePlanVersion,
    activeAssessments: [input.sourceAssessment],
    changedFactIds: input.action.expectedDelta.factMutations.map((f) => f.factId),
  });
  const invalidated = markAssessmentsInvalidated(toInvalidate, {
    actionId: input.action.actionId,
    supersededByAssessmentId: nextAssessment.assessmentId,
  });

  const outcomeEvent: OntologyOutcomeEventV1 = {
    schemaId: ONTOLOGY_OUTCOME_EVENT_SCHEMA_ID,
    outcomeEventId: `oe_${input.action.actionId}_${occurredAt.replace(/[:.]/g, '')}`,
    actionId: input.action.actionId,
    sourceAssessmentId: input.sourceAssessment.assessmentId,
    contextId: input.contextId,
    basedOnRevision: input.action.basedOnRevision,
    authorityRunId: input.authorityRunId,
    result: input.result ?? 'APPLIED',
    changedPlanVersion: input.changedPlanVersion,
    changedFactIds: input.action.expectedDelta.factMutations.map((f) => f.factId),
    invalidatedAssessmentIds: invalidated.map((a) => a.assessmentId),
    reevaluationAssessmentId: nextAssessment.assessmentId,
    reevaluationOutcome: nextAssessment.outcome,
    occurredAt,
  };

  recordAuthorityConsumptionTrace({
    consumer: 'monitoring.apply',
    tripId: input.sourceAssessment.affectedScopes[0]?.tripId,
    inputRevision: input.action.basedOnRevision,
    assessmentId: nextAssessment.assessmentId,
    runtimeAuthority: 'ONTOLOGY_CANONICAL',
    factsUsed: nextAssessment.factRefs,
    constraintVersion: nextAssessment.basis.constraintVersion,
    outputRevision: input.action.basedOnRevision + 1,
    legacyWriteAttempted: false,
    reasonCodes: nextAssessment.reasonCodes,
  });

  return { outcomeEvent, invalidated, nextAssessment };
}

export function assertActionProposalRevisionFresh(input: {
  proposal: ActionProposal;
  currentRevision: number;
}): void {
  if (input.proposal.basedOnRevision !== input.currentRevision) {
    throw new Error(
      `ONT-WRITE-003: ActionProposal basedOnRevision=${input.proposal.basedOnRevision} != current=${input.currentRevision}`,
    );
  }
}
