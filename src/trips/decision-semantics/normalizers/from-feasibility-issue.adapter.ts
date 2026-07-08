/**
 * FeasibilityIssueDto → DecisionProblem + ConstraintAssertion
 */

import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { DecisionProblem } from '../types/decision-semantics.types';
import {
  buildAssertionFromFeasibilityIssue,
  buildFeasibilitySemanticKey,
  inferProblemStatus,
  inferProblemType,
  stableProblemId,
} from './constraint-semantic.normalizer';
import { domainFromAssertion, resolveDecisionAuthority } from '../authority/decision-authority.matrix';
import { propagateAffectedScopes } from '../propagation/impact-propagation.service';

export interface FeasibilityIssueAdaptation {
  problem: DecisionProblem;
  assertion: ReturnType<typeof buildAssertionFromFeasibilityIssue>;
}

export function adaptFeasibilityIssueToProblem(
  issue: FeasibilityIssueDto,
  tripId: string,
  tripVersion: string,
  detectedAt: string,
): FeasibilityIssueAdaptation {
  const assertion = buildAssertionFromFeasibilityIssue(issue, tripId);
  const affectedScope = propagateAffectedScopes(issue, assertion);
  const primaryDomain = domainFromAssertion(assertion);
  const authority = resolveDecisionAuthority({
    problemType: inferProblemType(issue),
    primaryDomain,
    enforcement: assertion.enforcement,
    overridable: assertion.overridable,
    issueKind: issue.issueKind,
  });

  const problem: DecisionProblem = {
    id: stableProblemId(issue),
    tripId,
    type: inferProblemType(issue),
    title: issue.title,
    description: issue.message,
    detectedBy: 'FEASIBILITY',
    detectedAt,
    tripVersion,
    affectedScope,
    status: inferProblemStatus(issue),
    semanticKey: issue.semanticKey ?? buildFeasibilitySemanticKey(issue),
    sourceRefs: [{ system: 'FEASIBILITY', refId: issue.id }],
    assertionIds: [assertion.id],
    authority,
  };

  return { problem, assertion };
}

export function findIssueByProblemId(
  issues: FeasibilityIssueDto[],
  problemId: string,
): FeasibilityIssueDto | undefined {
  return issues.find((i) => stableProblemId(i) === problemId || i.id === problemId || i.semanticKey === problemId);
}
