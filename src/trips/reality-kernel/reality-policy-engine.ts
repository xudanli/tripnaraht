/**
 * Reality Policy Engine — single decision entry for snapshot validity, ingress, and escalation.
 *
 * Replaces ad hoc checks in weather / routing / conflicts adapters with one evaluate path.
 */

import type { Logger } from '@nestjs/common';
import type { DecisionContextV0 } from './decision-context.types';
import type { RealityReadPolicy } from './reality-read-policy.types';
import { getDefaultRealityReadPolicy, getRealityBypassEscalation, isRealityReadBoundaryEnabled } from './reality-enforcement.env';
import { getBoundDecisionContext } from './reality-context.storage';
import {
  isRealityBypassLoggingEnabled,
  logRealityBypass,
} from './reality-read-audit';
import { ExecutionGate, enforceExecutionDecision } from './reality-execution-gate';
import type { SnapshotValidityStatus } from './reality-snapshot.types';
import type {
  RealityExecutionContractFlagsV0,
  RealityExecutionTraceEventV0,
  RealityPolicyCode,
  RealityPolicyEvaluateResult,
  RealityPolicyVerdict,
} from './reality-policy-engine.types';
import type { TripWorldState } from '../decision/world-model';

const allowAll: RealityExecutionContractFlagsV0 = {
  allowContinuePlanning: true,
  degradePlan: false,
  requireReplan: false,
  blockLiveWorldRead: false,
};

function flagsForVerdict(
  verdict: RealityPolicyVerdict,
  overrides: Partial<RealityExecutionContractFlagsV0> = {},
): RealityExecutionContractFlagsV0 {
  const base: RealityExecutionContractFlagsV0 =
    verdict === 'ALLOW'
      ? { ...allowAll }
      : verdict === 'DEGRADE'
        ? {
            allowContinuePlanning: true,
            degradePlan: true,
            requireReplan: false,
            blockLiveWorldRead: false,
          }
        : {
            allowContinuePlanning: false,
            degradePlan: false,
            requireReplan: true,
            blockLiveWorldRead: true,
          };
  return { ...base, ...overrides };
}

function result(
  verdict: RealityPolicyVerdict,
  codes: RealityPolicyCode[],
  reasons: string[],
  execution: RealityExecutionContractFlagsV0,
  validityStatus?: SnapshotValidityStatus,
): RealityPolicyEvaluateResult {
  return { verdict, codes, reasons, execution, validityStatus };
}

export type RealityPolicyScenario = 'planning_tick' | 'world_read';

export type RealityPolicyEvaluateInput =
  | { scenario: 'planning_tick'; decisionContext: DecisionContextV0 | undefined }
  | {
      scenario: 'world_read';
      decisionContext: DecisionContextV0 | undefined;
      policy: RealityReadPolicy;
      boundaryEnabled: boolean;
    };

/**
 * Unified policy evaluation — routing hub for Reality-Constrained Execution.
 */
export function evaluateRealityPolicy(input: RealityPolicyEvaluateInput): RealityPolicyEvaluateResult {
  if (input.scenario === 'planning_tick') {
    return evaluatePlanningTick(input.decisionContext);
  }
  return evaluateWorldRead(input);
}

/** Planning tick: INVALIDATED → BLOCK; STALE → DEGRADE + degrade plan; else ALLOW. */
export function evaluatePlanningTick(
  decisionContext: DecisionContextV0 | undefined,
): RealityPolicyEvaluateResult {
  if (!decisionContext) {
    return result(
      'ALLOW',
      ['NO_BOUND_CONTEXT'],
      ['no_bound_decision_context'],
      flagsForVerdict('ALLOW'),
    );
  }
  const status = decisionContext.reality.validity.status;
  const validityStatus = status;
  if (status === 'INVALIDATED') {
    const reasons = decisionContext.reality.validity.invalidation_reasons ?? ['snapshot_invalidated'];
    return result(
      'BLOCK',
      ['SNAPSHOT_INVALIDATED'],
      reasons,
      flagsForVerdict('BLOCK'),
      validityStatus,
    );
  }
  if (status === 'STALE') {
    return result(
      'DEGRADE',
      ['SNAPSHOT_STALE'],
      ['snapshot_stale'],
      { ...flagsForVerdict('DEGRADE'), degradePlan: true, allowContinuePlanning: true },
      validityStatus,
    );
  }
  return result('ALLOW', ['SNAPSHOT_VALID'], ['snapshot_valid'], flagsForVerdict('ALLOW'), validityStatus);
}

/** Adapter ingress: merges read policy, snapshot validity, boundary flag, bypass escalation. */
export function evaluateWorldRead(params: {
  policy: RealityReadPolicy;
  decisionContext: DecisionContextV0 | undefined;
  boundaryEnabled: boolean;
}): RealityPolicyEvaluateResult {
  const { policy, decisionContext, boundaryEnabled } = params;

  if (!boundaryEnabled) {
    return result('ALLOW', ['BOUNDARY_DISABLED'], ['reality_read_boundary_off'], allowAll);
  }

  if (policy === 'LIVE_OVERRIDE_ALLOWED') {
    return result('ALLOW', ['LIVE_OVERRIDE'], ['live_override_policy'], allowAll);
  }

  if (!decisionContext) {
    if (policy === 'SNAPSHOT_ONLY') {
      return result(
        'BLOCK',
        ['SNAPSHOT_ONLY_NO_CTX'],
        ['missing_decision_context'],
        { ...flagsForVerdict('BLOCK'), blockLiveWorldRead: true },
      );
    }
    const esc = getRealityBypassEscalation();
    if (esc === 'block') {
      return result(
        'BLOCK',
        ['BYPASS_BLOCK'],
        ['bypass_escalation_block'],
        { ...flagsForVerdict('BLOCK'), blockLiveWorldRead: true },
      );
    }
    if (esc === 'error') {
      return result(
        'DEGRADE',
        ['BYPASS_ERROR'],
        ['bypass_escalation_error'],
        { ...flagsForVerdict('DEGRADE'), degradePlan: false, blockLiveWorldRead: false },
      );
    }
    return result(
      'DEGRADE',
      ['BYPASS_WARN'],
      ['missing_decision_context_preferred'],
      { ...flagsForVerdict('DEGRADE'), degradePlan: false },
    );
  }

  const status = decisionContext.reality.validity.status;

  if (status === 'INVALIDATED') {
    if (policy === 'SNAPSHOT_ONLY') {
      return result(
        'BLOCK',
        ['SNAPSHOT_ONLY_INVALIDATED'],
        decisionContext.reality.validity.invalidation_reasons ?? ['snapshot_invalidated'],
        { ...flagsForVerdict('BLOCK'), blockLiveWorldRead: true },
        status,
      );
    }
    return result(
      'DEGRADE',
      ['SNAPSHOT_INVALIDATED'],
      decisionContext.reality.validity.invalidation_reasons ?? ['snapshot_invalidated_degraded_read'],
      { ...flagsForVerdict('DEGRADE'), requireReplan: true },
      status,
    );
  }

  if (status === 'STALE') {
    return result(
      'DEGRADE',
      ['SNAPSHOT_STALE'],
      ['snapshot_stale_world_read'],
      flagsForVerdict('DEGRADE'),
      status,
    );
  }

  return result('ALLOW', ['SNAPSHOT_VALID'], ['snapshot_valid'], allowAll, status);
}

/** Append causality event for “why was execution allowed?” (P1 trace). */
export function appendRealityExecutionTrace(
  state: TripWorldState,
  event: Omit<RealityExecutionTraceEventV0, 'at'> & { at?: string },
): void {
  const at = event.at ?? new Date().toISOString();
  if (!state.signals.realityExecutionTrace) {
    state.signals.realityExecutionTrace = [];
  }
  state.signals.realityExecutionTrace.push({ ...event, at });
}

type PolicyLogger = Pick<Logger, 'log' | 'warn' | 'error'>;

/**
 * Single ingress gate for live world reads — policy verdict + audit log on DEGRADE.
 * Throws `RealityExecutionBlockedError` when `ExecutionGate.resolve` yields BLOCK.
 */
export function assertRealityWorldReadAllowed(
  logger: PolicyLogger,
  component: string,
  detail: string,
): RealityPolicyEvaluateResult {
  const decisionContext = getBoundDecisionContext();
  const policy = decisionContext?.read_policy ?? getDefaultRealityReadPolicy();
  const r = evaluateWorldRead({
    policy,
    decisionContext,
    boundaryEnabled: isRealityReadBoundaryEnabled(),
  });
  const execDecision = ExecutionGate.resolve({
    executionType: 'world_read',
    decisionContext,
    policyResult: r,
  });
  enforceExecutionDecision(execDecision, { snapshotId: decisionContext?.snapshot_id });
  if (execDecision.type === 'DEGRADE' && isRealityBypassLoggingEnabled()) {
    const esc = getRealityBypassEscalation();
    logRealityBypass(logger, component, detail, esc === 'error' ? 'error' : 'warn');
  }
  return r;
}

/** Unified façade — `evaluate()` is the single routing hub (planning vs world_read). */
export const RealityPolicyEngine = {
  evaluate: evaluateRealityPolicy,
  evaluatePlanningTick,
  evaluateWorldRead,
  assertWorldReadAllowed: assertRealityWorldReadAllowed,
} as const;

/** Alias for policy naming in docs / callers. */
export const RealityDecisionPolicy = {
  evaluate: evaluateRealityPolicy,
} as const;
