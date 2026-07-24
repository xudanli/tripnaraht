/**
 * RFC-001 Phase 0 — architecture iron rule and write-permission guards.
 *
 * Guardian 产生材料，Decision Core 作出决定，Authorization 允许行动，Ledger 证明发生过什么。
 */

import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import {
  DECISION_CORE_EXCLUSIVE_FIELDS,
  type Rfc001DecisionRecord,
} from '../contracts/decision-record.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { PlanVersion } from '../contracts/plan-version.types';

export const ARCHITECTURE_IRON_RULE =
  'Only Decision Core may form DecisionRecord; only authorized DecisionRecord may change Effective Plan.';

export type WritePermissionViolationCode =
  | 'GUARDIAN_WROTE_DECISION_FIELD'
  | 'NEPTUNE_DIRECT_PLAN_MUTATION'
  | 'GUARDIAN_DEBATE_FINALIZE'
  | 'GUARDIAN_RESULTS_AS_EXECUTION_SOURCE'
  | 'EFFECTIVE_PLAN_WITHOUT_DECISION'
  | 'UNKNOWN_VERDICT_AS_PASS'
  | 'WORKSPACE_STALE_FINALIZE'
  | 'BLOCK_OVERRIDDEN';

export class WritePermissionViolationError extends Error {
  constructor(
    public readonly code: WritePermissionViolationCode,
    message: string,
  ) {
    super(message);
    this.name = 'WritePermissionViolationError';
  }
}

/** Guardian outputs must not carry Decision Core exclusive fields */
export function assertGuardianPayloadHasNoDecisionFields(
  payload: Record<string, unknown>,
  actor: string,
): void {
  for (const field of DECISION_CORE_EXCLUSIVE_FIELDS as readonly string[]) {
    if (field in payload && payload[field] !== undefined) {
      throw new WritePermissionViolationError(
        'GUARDIAN_WROTE_DECISION_FIELD',
        `${actor} attempted to write Decision Core exclusive field "${field}"`,
      );
    }
  }
}

/** Neptune must not emit effective plan mutations — only RepairCandidate */
export function assertNeptuneDoesNotDirectlyMutatePlan(context: {
  hasUpdatedPlan?: boolean;
  hasEffectivePlanPointerChange?: boolean;
  source: string;
}): void {
  if (context.hasUpdatedPlan || context.hasEffectivePlanPointerChange) {
    throw new WritePermissionViolationError(
      'NEPTUNE_DIRECT_PLAN_MUTATION',
      `Neptune direct plan mutation forbidden (source=${context.source}). Use RepairCandidate + Decision Core.`,
    );
  }
}

/** GuardianDebate must not be wired as finalize source in new code paths */
export function assertGuardianDebateNotFinalizeSource(caller: string): void {
  throw new WritePermissionViolationError(
    'GUARDIAN_DEBATE_FINALIZE',
    `GuardianDebate cannot finalize decisions (caller=${caller}). Use DecisionCoreService.finalize.`,
  );
}

/** guardian_results / persona votes are presentation-only, not execution authority */
export function assertNotExecutionSourceFromGuardianResults(sourceLabel: string): void {
  if (/guardian_results|persona_vote|deriveGuardianPersonaVotes/i.test(sourceLabel)) {
    throw new WritePermissionViolationError(
      'GUARDIAN_RESULTS_AS_EXECUTION_SOURCE',
      `Execution cannot be sourced from guardian projection (${sourceLabel})`,
    );
  }
}

/** Effective plan switch requires authorized decision */
export function assertEffectivePlanRequiresDecision(input: {
  planVersion: PlanVersion;
  decision?: Pick<Rfc001DecisionRecord, 'decisionId' | 'recordStatus' | 'authorizationRequirement'>;
}): void {
  if (input.planVersion.status !== 'EFFECTIVE') return;
  const d = input.decision;
  if (!d?.decisionId) {
    throw new WritePermissionViolationError(
      'EFFECTIVE_PLAN_WITHOUT_DECISION',
      `PlanVersion ${input.planVersion.planVersionId} cannot become EFFECTIVE without DecisionRecord`,
    );
  }
  if (d.recordStatus !== 'AUTHORIZED' && d.recordStatus !== 'EFFECTIVE') {
    throw new WritePermissionViolationError(
      'EFFECTIVE_PLAN_WITHOUT_DECISION',
      `PlanVersion ${input.planVersion.planVersionId} requires AUTHORIZED DecisionRecord (got ${d.recordStatus})`,
    );
  }
}

/** UNKNOWN verdict must not be treated as PASS */
export function assertUnknownNotTreatedAsPass(verdict: string, context: string): void {
  if (verdict === 'UNKNOWN') {
    throw new WritePermissionViolationError(
      'UNKNOWN_VERDICT_AS_PASS',
      `UNKNOWN constraint verdict cannot be coerced to PASS (${context})`,
    );
  }
}

/** Non-overridable BLOCK cannot be overridden by user, Neptune, or debate */
export function assertBlockNotOverridden(assertion: Rfc001ConstraintAssertion): void {
  if (assertion.verdict === 'BLOCK' && !assertion.overridable) {
    throw new WritePermissionViolationError(
      'BLOCK_OVERRIDDEN',
      `Non-overridable BLOCK on candidate ${assertion.targetCandidateId ?? 'base'} cannot be overridden`,
    );
  }
}

export function assertWorkspaceReadyForFinalize(
  workspace: DecisionWorkspace,
  currentWorldStateSnapshotId: string,
): void {
  if (workspace.status === 'STALE' || workspace.status === 'ABANDONED') {
    throw new WritePermissionViolationError(
      'WORKSPACE_STALE_FINALIZE',
      `Workspace ${workspace.workspaceId} is ${workspace.status}; cannot finalize`,
    );
  }
  if (workspace.worldStateSnapshotId !== currentWorldStateSnapshotId) {
    throw new WritePermissionViolationError(
      'WORKSPACE_STALE_FINALIZE',
      `Workspace snapshot ${workspace.worldStateSnapshotId} stale vs current ${currentWorldStateSnapshotId}`,
    );
  }
}

export function candidateHasNonOverridableBlock(
  workspace: DecisionWorkspace,
  candidateId: string,
): boolean {
  return workspace.constraintAssertions.some(
    (a) =>
      a.targetCandidateId === candidateId &&
      a.verdict === 'BLOCK' &&
      !a.overridable,
  );
}
