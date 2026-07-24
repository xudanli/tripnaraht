/**
 * FeasibilityIssueDto → ConstraintAssessment (Phase 1 adapter; does not change feasibility hot path).
 */

import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { ConstraintEnforcement } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  buildAssertionFromFeasibilityIssue,
  buildFeasibilitySemanticKey,
} from '../../../trips/decision-semantics/normalizers/constraint-semantic.normalizer';
import type { ConstraintEvaluationStatus } from '../contracts/constraint-assertion';
import type {
  ConstraintAssessment,
  ConstraintEvaluationMode,
} from '../contracts/constraint-assessment.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA } from '../contracts/constraint-assessment.types';
import type { EvaluationContextVersion } from '../contracts/evaluation-context-version.types';

export function enforcementToAssessmentStatus(
  enforcement: ConstraintEnforcement,
): ConstraintEvaluationStatus {
  switch (enforcement) {
    case 'BLOCK':
      return 'BLOCK';
    case 'WARN':
    case 'REQUIRE_ADJUSTMENT':
      return 'WARNING';
    case 'REQUIRE_CONFIRMATION':
      return 'REQUIRES_VERIFICATION';
    case 'INFORM':
      return 'WARNING';
    default:
      return 'WARNING';
  }
}

export function feasibilityPriorityToStatus(
  issue: FeasibilityIssueDto,
  enforcement: ConstraintEnforcement,
): ConstraintEvaluationStatus {
  if (enforcement === 'BLOCK') return 'BLOCK';
  if (issue.proofs?.some((p) => p.evidenceType === 'coverage-gap') && issue.priority === 'must_handle') {
    return 'UNKNOWN';
  }
  return enforcementToAssessmentStatus(enforcement);
}

function collectSubjectRefs(issue: FeasibilityIssueDto): string[] {
  const refs: string[] = [];
  if (issue.fromItemId) refs.push(`item:${issue.fromItemId}`);
  if (issue.toItemId) refs.push(`item:${issue.toItemId}`);
  if (issue.visitorAccess?.evaluation.poiId) {
    refs.push(`poi:${issue.visitorAccess.evaluation.poiId}`);
  }
  for (const proof of issue.proofs ?? []) {
    if (proof.ruleId) refs.push(`rule:${proof.ruleId}`);
    if (proof.itemId) refs.push(`item:${proof.itemId}`);
  }
  return [...new Set(refs)];
}

function inferExplanationCode(issue: FeasibilityIssueDto): string {
  if (issue.issueKind) return issue.issueKind;
  if (issue.actionRequired) return 'ACTION_REQUIRED';
  return `feasibility.${issue.category}`;
}

function inferRuleRefs(issue: FeasibilityIssueDto): string[] | undefined {
  const fromProofs = (issue.proofs ?? [])
    .map((p) => p.ruleId)
    .filter((id): id is string => Boolean(id));
  if (!fromProofs.length) return undefined;
  return [...new Set(fromProofs)];
}

export function feasibilityIssueToAssessment(
  issue: FeasibilityIssueDto,
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
    policyRefs?: string[];
  },
): ConstraintAssessment {
  const semanticsAssertion = buildAssertionFromFeasibilityIssue(issue, input.tripId);
  const semanticKey = issue.semanticKey ?? buildFeasibilitySemanticKey(issue);
  const status = feasibilityPriorityToStatus(issue, semanticsAssertion.enforcement);
  const dayIds =
    issue.affectedDays?.length > 0
      ? issue.affectedDays.map((d) => `day-${d}`)
      : issue.tripDayId
        ? [issue.tripDayId]
        : undefined;

  return {
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA,
    assessmentId: `assess_feas_${issue.id}`,
    evaluationMode: input.evaluationMode,
    status,
    semanticKey,
    subjectRefs: collectSubjectRefs(issue),
    affectedScope: {
      tripId: input.tripId,
      dayIds,
      activityIds: issue.fromItemId ? [issue.fromItemId] : undefined,
      routeSegmentIds: issue.issueKind === 'road_class' ? ['route_segment'] : undefined,
    },
    policyRefs: input.policyRefs,
    ruleRefs: inferRuleRefs(issue),
    explanationCode: inferExplanationCode(issue),
    measuredValue: issue.anchors,
    evidenceRefs: (issue.proofs ?? []).map((p, i) => p.ruleId ?? `proof_${i}`),
    message: issue.message,
    overridable: semanticsAssertion.overridable,
    confidence: issue.proofs?.[0]?.confidence,
    contextVersion: input.contextVersion,
    evaluatedAt: input.evaluatedAt,
    sourceRef: { system: 'FEASIBILITY', refId: issue.id },
    semanticsAssertionId: semanticsAssertion.id,
  };
}

export function feasibilityIssuesToAssessments(
  issues: FeasibilityIssueDto[],
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
    policyRefsByIssueId?: Map<string, string[]>;
  },
): ConstraintAssessment[] {
  return issues.map((issue) =>
    feasibilityIssueToAssessment(issue, {
      ...input,
      policyRefs: input.policyRefsByIssueId?.get(issue.id),
    }),
  );
}
