import type { DecisionWorkspace } from '../../../trips/guardian-decision-core/contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../../../trips/guardian-decision-core/contracts/decision-record.types';
import type { PlanVersion } from '../../../trips/guardian-decision-core/contracts/plan-version.types';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';
import type { LedgerClosureKind } from '../assertions/canonical-authority.assertions';

const EXECUTION_TERMINAL_STATUSES = new Set<Rfc001DecisionRecord['recordStatus']>([
  'EFFECTIVE',
  'ROLLED_BACK',
  'FAILED',
  'PARTIAL',
  'NEEDS_REPAIR',
]);

export function extractRfc001LedgerClosureKinds(input: {
  problem: Rfc001DecisionProblem | null;
  workspace: DecisionWorkspace | null;
  record: Rfc001DecisionRecord | null;
  planVersion?: PlanVersion | null;
  evidenceRefCount?: number;
}): LedgerClosureKind[] {
  const kinds: LedgerClosureKind[] = [];
  const { problem, workspace, record, planVersion } = input;

  if (problem) kinds.push('PROBLEM');

  const evidenceRefs =
    (record?.evidenceRefs?.length ?? 0) +
    (workspace?.constraintAssertions?.flatMap((a) => a.evidenceRefs ?? []).length ?? 0) +
    (input.evidenceRefCount ?? 0);
  if (evidenceRefs > 0) kinds.push('EVIDENCE');

  if ((workspace?.constraintAssertions?.length ?? 0) > 0) kinds.push('CONSTRAINTS');
  if ((workspace?.repairCandidates?.length ?? 0) > 0) kinds.push('CANDIDATES');
  if ((workspace?.loadAssessments?.length ?? 0) > 0) kinds.push('EVALUATION');

  if (record?.selectedCandidateId) kinds.push('SELECTED_DECISION');

  const rejectedCount =
    record?.rejectedCandidates?.length ??
    workspace?.repairCandidates?.filter(
      (c) => c.candidateId !== record?.selectedCandidateId,
    ).length ??
    0;
  if (rejectedCount > 0) kinds.push('REJECTED_ALTERNATIVES');

  if (planVersion) kinds.push('PLAN_CHANGE');

  if (record && EXECUTION_TERMINAL_STATUSES.has(record.recordStatus)) {
    kinds.push('EXECUTION_STATUS');
  }

  return kinds;
}
