/**
 * DecisionScope bound-run verification — shared by Gateway / Solver / Verification.
 * Authority Consistency: same snapshotId + candidate ⊆ mutableObjects ∩ allowedActions.
 */

import { randomUUID } from 'crypto';
import type { ConstraintAssertion } from '../constraints/contracts/constraint-assertion';
import {
  assertCandidateWithinDecisionScope,
  assertSharedSnapshotId,
  type DecisionScope,
  type ScopeMutationCandidate,
} from '../contracts/decision-scope.types';

export const DECISION_SCOPE_SNAPSHOT_MISMATCH = 'DECISION_SCOPE_SNAPSHOT_MISMATCH' as const;
export const DECISION_SCOPE_VIOLATION = 'DECISION_SCOPE_VIOLATION' as const;

export type DecisionScopeEvaluationInput = {
  tripId: string;
  scope: DecisionScope;
  /** Consumers that must share scope.snapshotId (Decision / Solver / Verification). */
  consumers?: Array<{ name: string; snapshotId?: string | null }>;
  /** Optional mutation under verification. */
  candidate?: ScopeMutationCandidate;
};

export type DecisionScopeEvaluationResult = {
  ok: boolean;
  reasons: string[];
  assertions: ConstraintAssertion[];
};

function blockAssertion(input: {
  tripId: string;
  reasonCode: string;
  message: string;
}): ConstraintAssertion {
  return {
    assertionId: `decision_scope_${randomUUID()}`,
    constraintType: 'DECISION_SCOPE',
    status: 'BLOCK',
    severity: 'CRITICAL',
    scope: { tripId: input.tripId },
    reasonCode: input.reasonCode,
    evidenceRefs: [],
    message: input.message,
    remediationHints: [
      'Keep Decision / Solver / Verification on one snapshotId',
      'Restrict mutations to DecisionScope.mutableObjects ∩ allowedActions',
    ],
    evaluator: { engine: 'decision-scope', version: '1.0.0', ruleId: 'scope.bound_run' },
    overridable: false,
  };
}

/**
 * Evaluate DecisionScope binding for one Decision Run.
 * Produces Gateway-compatible BLOCK assertions on failure.
 */
export function evaluateDecisionScopeBoundRun(
  input: DecisionScopeEvaluationInput,
): DecisionScopeEvaluationResult {
  const reasons: string[] = [];
  const assertions: ConstraintAssertion[] = [];

  const consumers = input.consumers?.length
    ? input.consumers
    : [
        { name: 'decision', snapshotId: input.scope.snapshotId },
        { name: 'solver', snapshotId: input.scope.snapshotId },
        { name: 'verification', snapshotId: input.scope.snapshotId },
      ];

  try {
    assertSharedSnapshotId(input.scope.snapshotId, consumers);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    reasons.push(message);
    assertions.push(
      blockAssertion({
        tripId: input.tripId,
        reasonCode: DECISION_SCOPE_SNAPSHOT_MISMATCH,
        message,
      }),
    );
  }

  if (input.candidate) {
    const gate = assertCandidateWithinDecisionScope(input.scope, input.candidate);
    if (gate.ok === false) {
      reasons.push(gate.reason);
      assertions.push(
        blockAssertion({
          tripId: input.tripId,
          reasonCode: DECISION_SCOPE_VIOLATION,
          message: gate.reason,
        }),
      );
    }
  }

  return { ok: reasons.length === 0, reasons, assertions };
}
