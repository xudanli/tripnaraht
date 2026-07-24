/**
 * Aggregate lane statuses — safety + stage precedence (Phase 0).
 */

import type { ConstraintEvaluationStatus } from '../contracts/constraint-assertion';
import type {
  UnifiedAssessmentAggregateStatus,
  UnifiedConstraintAssessmentLane,
} from '../contracts/unified-constraint-assessment.types';

const STATUS_RANK: Record<UnifiedAssessmentAggregateStatus, number> = {
  PASS: 0,
  WARN: 1,
  PLANNING_BLOCK: 2,
  EXECUTION_BLOCK: 3,
  RUNTIME_BLOCK: 4,
  UNKNOWN: 1,
};

export function feasibilityStatusToAggregate(
  status: ConstraintEvaluationStatus,
): UnifiedAssessmentAggregateStatus {
  switch (status) {
    case 'BLOCK':
      return 'PLANNING_BLOCK';
    case 'WARNING':
    case 'REQUIRES_VERIFICATION':
      return 'WARN';
    case 'UNKNOWN':
      return 'UNKNOWN';
    case 'PASS':
    default:
      return 'PASS';
  }
}

export function tepOutcomeToLaneStatus(outcome: string): ConstraintEvaluationStatus {
  switch (outcome) {
    case 'REJECT':
      return 'BLOCK';
    case 'SUGGEST_REPAIR':
    case 'NEED_CONFIRM':
      return 'WARNING';
    case 'CAUTION':
    case 'UNKNOWN':
      return 'WARNING';
    case 'PASS':
    default:
      return 'PASS';
  }
}

export function tepOutcomeToAggregate(outcome: string): UnifiedAssessmentAggregateStatus {
  switch (outcome) {
    case 'REJECT':
      return 'EXECUTION_BLOCK';
    case 'SUGGEST_REPAIR':
    case 'CAUTION':
    case 'UNKNOWN':
      return 'WARN';
    case 'PASS':
    default:
      return 'PASS';
  }
}

/** Executability lane uses stricter mapping for product-facing verification failures. */
export function tepOutcomeToExecutabilityLaneStatus(outcome: string): ConstraintEvaluationStatus {
  switch (outcome) {
    case 'REJECT':
    case 'SUGGEST_REPAIR':
    case 'NEED_CONFIRM':
      return 'BLOCK';
    case 'CAUTION':
    case 'UNKNOWN':
      return 'WARNING';
    case 'PASS':
    default:
      return 'PASS';
  }
}

export function tepOutcomeToExecutabilityAggregate(outcome: string): UnifiedAssessmentAggregateStatus {
  switch (outcome) {
    case 'REJECT':
    case 'SUGGEST_REPAIR':
    case 'NEED_CONFIRM':
      return 'EXECUTION_BLOCK';
    case 'CAUTION':
    case 'UNKNOWN':
      return 'WARN';
    case 'PASS':
    default:
      return 'PASS';
  }
}

export function resolveAggregateStatus(input: {
  planning: UnifiedConstraintAssessmentLane | null;
  executability: UnifiedConstraintAssessmentLane | null;
  runtime: UnifiedConstraintAssessmentLane | null;
}): UnifiedAssessmentAggregateStatus {
  const candidates: UnifiedAssessmentAggregateStatus[] = ['PASS'];

  if (input.runtime?.status === 'BLOCK') {
    candidates.push('RUNTIME_BLOCK');
  } else if (input.runtime && input.runtime.status !== 'PASS') {
    candidates.push('WARN');
  }

  if (input.executability?.status === 'BLOCK') {
    candidates.push('EXECUTION_BLOCK');
  } else if (input.executability && input.executability.status !== 'PASS') {
    candidates.push(
      input.executability.status === 'UNKNOWN' ? 'UNKNOWN' : 'WARN',
    );
  }

  if (input.planning?.status === 'BLOCK') {
    candidates.push('PLANNING_BLOCK');
  } else if (input.planning && input.planning.status !== 'PASS') {
    candidates.push('WARN');
  }

  return candidates.reduce((worst, current) =>
    STATUS_RANK[current] > STATUS_RANK[worst] ? current : worst,
  );
}

export function pickStricterAggregate(
  a: UnifiedAssessmentAggregateStatus,
  b: UnifiedAssessmentAggregateStatus,
): UnifiedAssessmentAggregateStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}
