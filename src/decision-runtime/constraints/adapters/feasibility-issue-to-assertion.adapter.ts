/**
 * FeasibilityIssueDto → Gateway ConstraintAssertion (Phase 2 provider bridge).
 */

import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import {
  buildAssertionFromFeasibilityIssue,
  buildFeasibilitySemanticKey,
} from '../../../trips/decision-semantics/normalizers/constraint-semantic.normalizer';
import type {
  ConstraintAssertion,
  ConstraintAssertionSeverity,
  ConstraintEvaluationStatus,
} from '../contracts/constraint-assertion';
import {
  enforcementToAssessmentStatus,
  feasibilityPriorityToStatus,
} from './feasibility-issue-to-assessment.adapter';

const POI_ACCESS_ENGINE = 'poi-access-capacity';
const POI_ACCESS_VERSION = '1.0.0';

function mapStatusToSeverity(
  status: ConstraintEvaluationStatus,
  constraintType: string,
): ConstraintAssertionSeverity {
  if (status === 'BLOCK' || status === 'REQUIRES_VERIFICATION') return 'CRITICAL';
  if (status === 'UNKNOWN') return 'HIGH';
  if (/risk|weather|road/i.test(constraintType)) return 'HIGH';
  return status === 'WARNING' ? 'MEDIUM' : 'LOW';
}

export function feasibilityIssueToGatewayAssertion(
  issue: FeasibilityIssueDto,
  tripId: string,
  evaluatorEngine = POI_ACCESS_ENGINE,
): ConstraintAssertion {
  const semanticsAssertion = buildAssertionFromFeasibilityIssue(issue, tripId);
  const status = feasibilityPriorityToStatus(issue, semanticsAssertion.enforcement);
  const semanticKey = issue.semanticKey ?? buildFeasibilitySemanticKey(issue);

  return {
    assertionId: `feas_${issue.id}`,
    constraintType: semanticKey,
    status,
    severity: mapStatusToSeverity(status, semanticKey),
    scope: {
      tripId,
      dayId: issue.tripDayId ?? (issue.affectedDays?.[0] != null ? `day-${issue.affectedDays[0]}` : undefined),
      activityId: issue.fromItemId,
    },
    reasonCode: issue.issueKind ?? semanticsAssertion.enforcement,
    evidenceRefs: (issue.proofs ?? []).map((p, i) => p.ruleId ?? `proof_${i}`),
    message: issue.message,
    remediationHints: issue.repairOptions?.map((r) => r.label),
    evaluator: { engine: evaluatorEngine, version: POI_ACCESS_VERSION, ruleId: issue.issueKind },
    overridable: semanticsAssertion.overridable,
    confidence: issue.proofs?.[0]?.confidence,
  };
}

export function gatewayAssertionStatusFromEnforcement(
  enforcement: import('../../../trips/decision-semantics/types/decision-semantics.types').ConstraintEnforcement,
): ConstraintEvaluationStatus {
  return enforcementToAssessmentStatus(enforcement);
}
