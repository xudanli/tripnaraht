/**
 * Reality Execution Gate — sole authority: “may this execution proceed, and under what mode?”
 *
 * RealityPolicyEngine evaluates; ExecutionGate.resolve() binds reality layer + policy into ExecutionDecision.
 * No advisory mode: BLOCK throws via enforceExecutionDecision.
 */

import type { DecisionContextV0 } from './decision-context.types';
import type {
  DegradeStrategy,
  ExecutionDecision,
  ExecutionGateKind,
} from './execution-gate.types';
import type { RealityPolicyCode, RealityPolicyEvaluateResult } from './reality-policy-engine.types';

/** Mirrors {@link DecisionContextV0.execution_runtime_mode}. */
export type ExecutionRuntimeMode = 'NORMAL' | 'DEGRADED';

export class RealityExecutionBlockedError extends Error {
  override readonly name = 'RealityExecutionBlockedError';
  readonly codes: RealityPolicyCode[];
  readonly snapshotId?: string;

  constructor(
    message: string,
    opts?: {
      codes?: RealityPolicyCode[];
      snapshotId?: string;
    },
  ) {
    super(message);
    this.codes = opts?.codes ?? [];
    this.snapshotId = opts?.snapshotId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Single resolution — reality layer (validity) + policy layer (verdict) → execution decision.
 */
export function resolveExecutionGate(input: {
  executionType: ExecutionGateKind;
  decisionContext?: DecisionContextV0;
  policyResult: RealityPolicyEvaluateResult;
}): ExecutionDecision {
  const validity = input.decisionContext?.reality.validity.status;

  if (validity === 'INVALIDATED') {
    return {
      type: 'BLOCK',
      reason: 'reality_snapshot_invalidated',
      codes: ['SNAPSHOT_INVALIDATED'],
    };
  }

  if (input.policyResult.verdict === 'BLOCK') {
    return {
      type: 'BLOCK',
      reason: input.policyResult.reasons.join('; ') || 'policy_verdict_block',
      codes: input.policyResult.codes,
    };
  }

  if (validity === 'STALE' || input.policyResult.verdict === 'DEGRADE') {
    const strategy: DegradeStrategy =
      input.executionType === 'world_read'
        ? 'WORLD_READ_BOUND_AUDIT'
        : 'PLANNING_HEURISTIC_ONLY';
    return { type: 'DEGRADE', strategy };
  }

  return { type: 'ALLOW' };
}

/** Abort execution path — same error type for planning repair and world ingress BLOCK. */
export function enforceExecutionDecision(
  decision: ExecutionDecision,
  meta: { snapshotId?: string },
): void {
  if (decision.type !== 'BLOCK') return;
  throw new RealityExecutionBlockedError(
    `[EXECUTION_GATE] ${decision.reason} codes=${decision.codes.join(',')}`,
    { codes: decision.codes, snapshotId: meta.snapshotId },
  );
}

/** Bind ALS context + degrade strategy — callers must not infer BLOCK/DEGRADE locally. */
export function bindExecutionDecisionToContext(
  ctx: DecisionContextV0 | undefined,
  decision: ExecutionDecision,
): void {
  if (!ctx || decision.type === 'BLOCK') return;
  if (decision.type === 'ALLOW') {
    ctx.execution_runtime_mode = 'NORMAL';
    ctx.execution_degrade_strategy = undefined;
    return;
  }
  ctx.execution_runtime_mode = 'DEGRADED';
  ctx.execution_degrade_strategy = decision.strategy;
}

/** Live geo/routing/weather providers off — ExecutionGate chose PLANNING_HEURISTIC_ONLY. */
export function requiresPlanningHeuristicWorldModelOnly(
  ctx: DecisionContextV0 | undefined,
): boolean {
  return ctx?.execution_degrade_strategy === 'PLANNING_HEURISTIC_ONLY';
}

export const ExecutionGate = {
  resolve: resolveExecutionGate,
} as const;
