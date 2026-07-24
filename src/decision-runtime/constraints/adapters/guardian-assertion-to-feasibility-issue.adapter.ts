/**
 * Guardian canonical assertions → FeasibilityIssueDto (Phase 2c).
 */

import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { gatewayAssertionToFeasibilityIssue } from './assertion-to-feasibility-issue.adapter';
import { normalizeIssueId } from '../../../trips/trip-constraint-solver/utils/trip-revision.util';

function inferGuardianCategory(assertion: ConstraintAssertion): FeasibilityIssueDto['category'] {
  const code = assertion.constraintType.toLowerCase();
  if (code.includes('road') || code.includes('segment')) return 'transport';
  if (code.includes('weather') || code.includes('wind')) return 'environment';
  if (code.includes('load') || code.includes('drive')) return 'transport';
  return 'environment';
}

export function guardianAssertionToFeasibilityIssue(
  assertion: ConstraintAssertion,
): FeasibilityIssueDto {
  const base = gatewayAssertionToFeasibilityIssue(assertion);
  const semanticKey = assertion.evaluator.ruleId ?? assertion.constraintType;
  return {
    ...base,
    id: normalizeIssueId(`guardian-${assertion.assertionId}`),
    semanticKey,
    category: inferGuardianCategory(assertion),
    issueKind: semanticKey,
    proofs: [
      {
        entity: assertion.constraintType,
        constraint: assertion.reasonCode,
        currentFact: assertion.message,
        evidenceSource: 'guardian-assertion',
        evidenceType: 'gateway_projection',
        conclusion: assertion.status,
        ruleId: assertion.evaluator.ruleId,
        confidence: assertion.confidence,
      },
    ],
  };
}

export function guardianAssertionsToFeasibilityIssues(
  assertions: ConstraintAssertion[],
): FeasibilityIssueDto[] {
  return assertions
    .filter((a) => a.status !== 'PASS')
    .map((a) => guardianAssertionToFeasibilityIssue(a));
}
