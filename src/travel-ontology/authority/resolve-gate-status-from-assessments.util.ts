import {
  CONSTRAINT_ASSESSMENT_OUTCOME_RANK,
  type AssessmentAffectedGate,
  type ConstraintAssessment,
  type ConstraintAssessmentOutcome,
} from '../contracts/constraint-assessment.types';
import { recordAuthorityConsumptionTrace } from './record-authority-consumption-trace.util';
import type { AuthorityConsumer } from './authority-consumption-trace.types';

function isActive(a: ConstraintAssessment): boolean {
  return (
    a.lifecycleStatus !== 'INVALIDATED' &&
    a.lifecycleStatus !== 'SUPERSEDED' &&
    a.lifecycleStatus !== 'EXPIRED' &&
    !a.invalidated
  );
}

function defaultGatesForOutcome(
  outcome: ConstraintAssessmentOutcome,
): AssessmentAffectedGate[] {
  switch (outcome) {
    case 'BLOCK':
      return ['READY_TRANSITION', 'CONFIRM', 'EXECUTE', 'EXECUTABLE', 'CONTINUE_EDITING'];
    case 'NEED_CONFIRM':
      return ['CONFIRM', 'EXECUTE', 'READY_TRANSITION'];
    case 'WARNING':
      return ['CONFIRM'];
    case 'UNKNOWN':
      return ['READY_TRANSITION', 'CONFIRM'];
    default:
      return [];
  }
}

export function gatesForReasonCodes(
  outcome: ConstraintAssessmentOutcome,
  reasonCodes: string[],
): AssessmentAffectedGate[] {
  if (
    outcome === 'BLOCK' &&
    reasonCodes.some((c) => c.startsWith('ENTRY_') || c.startsWith('VISA_'))
  ) {
    return ['READY_TRANSITION', 'CONFIRM', 'EXECUTE', 'EXECUTABLE'];
  }
  return defaultGatesForOutcome(outcome);
}

function gatesOf(a: ConstraintAssessment): AssessmentAffectedGate[] {
  return a.affectedGates?.length
    ? a.affectedGates
    : gatesForReasonCodes(a.outcome, a.reasonCodes);
}

function mergeOutcomes(
  outcomes: ConstraintAssessmentOutcome[],
): ConstraintAssessmentOutcome {
  if (outcomes.length === 0) return 'ALLOW';
  return outcomes.reduce((acc, o) =>
    CONSTRAINT_ASSESSMENT_OUTCOME_RANK[o] > CONSTRAINT_ASSESSMENT_OUTCOME_RANK[acc] ? o : acc,
  );
}

export function resolveGateStatusFromAssessments(input: {
  assessments: ConstraintAssessment[];
  gate: AssessmentAffectedGate;
  consumer?: AuthorityConsumer;
  tripId?: string;
  inputRevision?: number | string;
}): {
  status: ConstraintAssessmentOutcome;
  assessmentIds: string[];
  reasonCodes: string[];
  allowsEditing: boolean;
  blocksReady: boolean;
} {
  const active = input.assessments.filter(isActive);
  const relevant = active.filter((a) => gatesOf(a).includes(input.gate));
  const status = mergeOutcomes(relevant.map((a) => a.outcome));
  const assessmentIds = relevant.map((a) => a.assessmentId);
  const reasonCodes = [...new Set(relevant.flatMap((a) => a.reasonCodes))];
  const readyRelevant = active.filter((a) => gatesOf(a).includes('READY_TRANSITION'));
  const readyStatus = mergeOutcomes(readyRelevant.map((a) => a.outcome));
  const blocksReady = readyStatus === 'BLOCK' || readyStatus === 'UNKNOWN';
  const editBlocking = active.filter(
    (a) => gatesOf(a).includes('CONTINUE_EDITING') && a.outcome === 'BLOCK',
  );
  const allowsEditing = editBlocking.length === 0;

  if (input.consumer) {
    recordAuthorityConsumptionTrace({
      consumer: input.consumer,
      tripId: input.tripId,
      inputRevision: input.inputRevision ?? 0,
      assessmentId: assessmentIds[0] ?? active[0]?.assessmentId ?? null,
      runtimeAuthority: 'ONTOLOGY_CANONICAL',
      factsUsed: [...new Set(relevant.flatMap((a) => a.factRefs))],
      constraintVersion:
        relevant[0]?.basis.constraintVersion ??
        active[0]?.basis.constraintVersion ??
        'none',
      outputRevision: null,
      legacyWriteAttempted: false,
      reasonCodes,
    });
  }

  return {
    status,
    assessmentIds,
    reasonCodes,
    allowsEditing,
    blocksReady:
      input.gate === 'READY_TRANSITION'
        ? status === 'BLOCK' || status === 'UNKNOWN'
        : blocksReady,
  };
}

export function withAffectedGates(assessment: ConstraintAssessment): ConstraintAssessment {
  if (assessment.affectedGates?.length) {
    return { ...assessment, lifecycleStatus: assessment.lifecycleStatus ?? 'ACTIVE' };
  }
  return {
    ...assessment,
    affectedGates: gatesForReasonCodes(assessment.outcome, assessment.reasonCodes),
    lifecycleStatus: assessment.lifecycleStatus ?? 'ACTIVE',
  };
}
