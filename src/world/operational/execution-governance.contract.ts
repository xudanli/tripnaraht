/**
 * Execution governance — control plane types (not itinerary.metadata).
 * Policy-Constrained Execution System v2 surface.
 */

import type { OperationalExecutionStatus } from './world-operational-arbitrator';

export const EXECUTION_POLICY_VERSION = 'exec-os.v2.2026-05-13';

export type PolicyStrength = 'hard' | 'soft';

export type ExecutionDecisionStatus = 'allow' | 'restricted' | 'blocked' | 'halt';

export interface RecoveryAction {
  type: 'reroute' | 'delay_departure' | 'downgrade_route' | 'change_vehicle';
  rationale: string[];
  estimatedRiskReduction?: number;
}

/** Explicit execution decision for UI / replanner / repair / memory — never infer from item metadata. */
export interface ExecutionDecision {
  status: ExecutionDecisionStatus;
  reasonCodes: string[];
  enforcedPolicies: Record<string, unknown>;
  recoveryOptions?: RecoveryAction[];
}

export type ItineraryGenerateResultType = 'itinerary' | 'execution_block' | 'needs_replan';

export type PartialExecutionState = 'none' | 'fallback_only' | 'blocked';

/**
 * Immutable policy hook emitted by policy.resolve (frozen at construction).
 */
export interface FrozenExecutionPolicyHook {
  readonly policyVersion: string;
  readonly policySource: string;
  readonly policyGeneratedAt: number;
  readonly causedByPolicies: readonly string[];
  /** Worst-case strength for quick planner routing */
  readonly policyStrengthDominant: PolicyStrength;
  readonly executionStatus: OperationalExecutionStatus;
  readonly denyLongDistanceAutorouting: boolean;
  readonly maxSingleLegDriveHours?: number;
  readonly forcedMinimumVehicleClass?: string | null;
  readonly haltAutomatedExecution: boolean;
  readonly arbitrationConfidence: number;
  readonly rawSeverity: string;
  /** Snapshot of human-readable / machine blockers for recovery + memory */
  readonly blockingSummary: readonly string[];
  readonly recoverySuggestions?: readonly Readonly<RecoveryAction>[];
}

export function defaultExecutionDecision(): ExecutionDecision {
  return {
    status: 'allow',
    reasonCodes: [],
    enforcedPolicies: {},
  };
}

export function executionStatusToPolicyStrengthDominant(
  s: OperationalExecutionStatus,
): PolicyStrength {
  if (s === 'blocked' || s === 'dangerous') return 'hard';
  return 'soft';
}

export function deriveCausedByPoliciesFromArbitration(blockingReasons: string[]): string[] {
  const out = new Set<string>();
  for (const b of blockingReasons) {
    const x = b.toLowerCase();
    if (/2wd|two.wheel|2\s*wd/.test(x)) out.add('vehicle.2wd.not_allowed');
    if (/f_road|f-road|froad/.test(x)) out.add('froad.segment.blocked');
    if (/safetravel|safe.?travel/.test(x)) out.add('safetravel.gate.block');
    if (/weather|wind|storm/.test(x)) out.add('weather.condition.elevated');
    if (/daylight|night|polar/.test(x)) out.add('daylight.window.constrained');
    if (/highland/.test(x)) out.add('route.highlands.constraint');
  }
  if (out.size === 0 && blockingReasons.length) {
    out.add('execution.blocking.unknown');
  }
  return [...out];
}

export function buildRecoveryActionsFromBlocking(blockingReasons: string[]): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  const blob = blockingReasons.join(' ').toLowerCase();
  if (/2wd|two.wheel/.test(blob)) {
    actions.push({
      type: 'change_vehicle',
      rationale: ['Upgrade to approved 4WD/AWD for current route class', 'Remove F-road / highlands segments until vehicle class matches'],
      estimatedRiskReduction: 0.45,
    });
  }
  if (/f_road|f-road|froad|road_closed|closed/.test(blob)) {
    actions.push({
      type: 'reroute',
      rationale: ['Use non-F alternative corridors', 'Wait for road.is reopening window if time-flexible'],
      estimatedRiskReduction: 0.35,
    });
  }
  if (/safetravel|wind|storm|weather/.test(blob)) {
    actions.push({
      type: 'delay_departure',
      rationale: ['Defer long exposed legs until wind/alert window improves', 'Shorten same-day driving envelope'],
      estimatedRiskReduction: 0.25,
    });
  }
  if (/daylight|night/.test(blob)) {
    actions.push({
      type: 'downgrade_route',
      rationale: ['Cluster activities in civil twilight window', 'Split across additional nights if needed'],
      estimatedRiskReduction: 0.2,
    });
  }
  if (actions.length === 0) {
    actions.push({
      type: 'reroute',
      rationale: ['Re-run worldState.summarize + policy.resolve after inputs change'],
      estimatedRiskReduction: 0.1,
    });
  }
  return actions;
}

export function cloneRecoveryActions(
  src?: readonly Readonly<RecoveryAction>[],
): RecoveryAction[] {
  if (!src?.length) return [];
  return src.map((r) => ({
    type: r.type,
    rationale: [...r.rationale],
    estimatedRiskReduction: r.estimatedRiskReduction,
  }));
}

/** Compose explicit execution decision from governance classification + frozen hook. */
export function composeExecutionDecision(
  hook: FrozenExecutionPolicyHook | undefined,
  gov: {
    resultType: ItineraryGenerateResultType;
    partialExecutionState: PartialExecutionState;
    suppressionApplied: boolean;
  },
): ExecutionDecision {
  if (!hook) {
    return defaultExecutionDecision();
  }

  const enforcedBase = (): Record<string, unknown> => ({
    policyVersion: hook.policyVersion,
    policySource: hook.policySource,
    policyGeneratedAt: hook.policyGeneratedAt,
    policyStrengthDominant: hook.policyStrengthDominant,
    causedByPolicies: [...hook.causedByPolicies],
    suppressionApplied: gov.suppressionApplied,
  });

  if (gov.resultType === 'execution_block') {
    return {
      status: 'halt',
      reasonCodes: hook.causedByPolicies.length ? [...hook.causedByPolicies] : ['execution.blocked'],
      enforcedPolicies: {
        ...enforcedBase(),
        haltAutomatedExecution: true,
        partialExecutionState: gov.partialExecutionState,
      },
      recoveryOptions: cloneRecoveryActions(hook.recoverySuggestions),
    };
  }

  if (gov.resultType === 'needs_replan') {
    return {
      status: 'restricted',
      reasonCodes: [...hook.causedByPolicies, 'policy.corridor.autofill_disabled'],
      enforcedPolicies: {
        ...enforcedBase(),
        denyLongDistanceAutorouting: hook.denyLongDistanceAutorouting,
        partialExecutionState: gov.partialExecutionState,
      },
      recoveryOptions: cloneRecoveryActions(hook.recoverySuggestions),
    };
  }

  if (gov.partialExecutionState === 'fallback_only') {
    return {
      status: 'restricted',
      reasonCodes: [...hook.causedByPolicies, 'policy.execution.fallback_surface'],
      enforcedPolicies: {
        ...enforcedBase(),
        maxSingleLegDriveHours: hook.maxSingleLegDriveHours,
        partialExecutionState: gov.partialExecutionState,
      },
      recoveryOptions:
        cloneRecoveryActions(hook.recoverySuggestions).length > 0
          ? cloneRecoveryActions(hook.recoverySuggestions)
          : undefined,
    };
  }

  if (hook.maxSingleLegDriveHours != null || hook.forcedMinimumVehicleClass) {
    return {
      status: 'restricted',
      reasonCodes:
        hook.causedByPolicies.length > 0
          ? [...hook.causedByPolicies]
          : [`execution.status.${hook.executionStatus}`],
      enforcedPolicies: {
        ...enforcedBase(),
        maxSingleLegDriveHours: hook.maxSingleLegDriveHours,
        forcedMinimumVehicleClass: hook.forcedMinimumVehicleClass,
        partialExecutionState: gov.partialExecutionState,
      },
      recoveryOptions:
        cloneRecoveryActions(hook.recoverySuggestions).length > 0
          ? cloneRecoveryActions(hook.recoverySuggestions)
          : undefined,
    };
  }

  if (hook.executionStatus !== 'safe') {
    return {
      status: 'restricted',
      reasonCodes:
        hook.causedByPolicies.length > 0
          ? [...hook.causedByPolicies]
          : [`execution.status.${hook.executionStatus}`],
      enforcedPolicies: { ...enforcedBase(), partialExecutionState: gov.partialExecutionState },
      recoveryOptions:
        cloneRecoveryActions(hook.recoverySuggestions).length > 0
          ? cloneRecoveryActions(hook.recoverySuggestions)
          : undefined,
    };
  }

  return {
    status: 'allow',
    reasonCodes: [],
    enforcedPolicies: { ...enforcedBase(), partialExecutionState: gov.partialExecutionState },
  };
}

export function freezeExecutionPolicyHook(mutable: {
  policySource: string;
  policyGeneratedAt: number;
  causedByPolicies: string[];
  policyStrengthDominant: PolicyStrength;
  executionStatus: OperationalExecutionStatus;
  denyLongDistanceAutorouting: boolean;
  maxSingleLegDriveHours?: number;
  forcedMinimumVehicleClass?: string | null;
  haltAutomatedExecution: boolean;
  arbitrationConfidence: number;
  rawSeverity: string;
  blockingSummary: string[];
  recoverySuggestions?: RecoveryAction[];
}): FrozenExecutionPolicyHook {
  const hook: FrozenExecutionPolicyHook = Object.freeze({
    policyVersion: EXECUTION_POLICY_VERSION,
    policySource: mutable.policySource,
    policyGeneratedAt: mutable.policyGeneratedAt,
    causedByPolicies: Object.freeze([...mutable.causedByPolicies]) as readonly string[],
    policyStrengthDominant: mutable.policyStrengthDominant,
    executionStatus: mutable.executionStatus,
    denyLongDistanceAutorouting: mutable.denyLongDistanceAutorouting,
    maxSingleLegDriveHours: mutable.maxSingleLegDriveHours,
    forcedMinimumVehicleClass: mutable.forcedMinimumVehicleClass ?? null,
    haltAutomatedExecution: mutable.haltAutomatedExecution,
    arbitrationConfidence: mutable.arbitrationConfidence,
    rawSeverity: mutable.rawSeverity,
    blockingSummary: Object.freeze([...mutable.blockingSummary]) as readonly string[],
    recoverySuggestions: mutable.recoverySuggestions?.length
      ? (Object.freeze(mutable.recoverySuggestions.map((r) => Object.freeze({ ...r }))) as readonly Readonly<RecoveryAction>[])
      : undefined,
  });
  return hook;
}
