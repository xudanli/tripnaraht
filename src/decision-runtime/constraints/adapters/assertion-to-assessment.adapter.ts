/**
 * Canonical ConstraintAssertion → ConstraintAssessment
 */

import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type {
  ConstraintAssessment,
  ConstraintEvaluationMode,
} from '../contracts/constraint-assessment.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA } from '../contracts/constraint-assessment.types';
import type { EvaluationContextVersion } from '../contracts/evaluation-context-version.types';

export function canonicalAssertionToAssessment(
  assertion: ConstraintAssertion,
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
    ruleRefs?: string[];
  },
): ConstraintAssessment {
  const dayIds = assertion.scope.dayId ? [assertion.scope.dayId] : undefined;
  return {
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA,
    assessmentId: `assess_gw_${assertion.assertionId}`,
    evaluationMode: input.evaluationMode,
    status: assertion.status,
    semanticKey: assertion.constraintType,
    subjectRefs: [
      ...(assertion.scope.activityId ? [`activity:${assertion.scope.activityId}`] : []),
      ...(assertion.scope.roadSegmentIds ?? []).map((id) => `route:${id}`),
    ],
    affectedScope: {
      tripId: input.tripId,
      dayIds,
      activityIds: assertion.scope.activityId ? [assertion.scope.activityId] : undefined,
      memberIds: assertion.scope.memberIds,
      routeSegmentIds: assertion.scope.roadSegmentIds,
    },
    ruleRefs: input.ruleRefs ?? (assertion.evaluator.ruleId ? [assertion.evaluator.ruleId] : undefined),
    explanationCode: assertion.reasonCode,
    evidenceRefs: assertion.evidenceRefs,
    message: assertion.message,
    overridable: assertion.overridable,
    confidence: assertion.confidence,
    contextVersion: input.contextVersion,
    evaluatedAt: input.evaluatedAt,
    sourceRef: { system: 'GATEWAY', refId: assertion.assertionId },
  };
}

export function canonicalReportToAssessments(
  assertions: ConstraintAssertion[],
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
  },
): ConstraintAssessment[] {
  return assertions.map((a) => canonicalAssertionToAssessment(a, input));
}
