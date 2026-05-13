/**
 * Consumes policy.resolve → executionPolicyHook inside itinerary generation (v2).
 * - Suppresses auto-inserted corridor DRIVE legs when long-distance autorouting is denied or execution is blocked.
 * - On blocked + halt: **no fake itinerary** — empty `days` + caller uses `resultType: execution_block`.
 * - Annotates remaining DRIVE items via `ItineraryItem.governance.max_drive_leg_hours` (control plane, not metadata).
 */

import type { ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { FrozenExecutionPolicyHook } from '../../world/operational/execution-governance.contract';
import type {
  ItineraryGenerateResultType,
  PartialExecutionState,
} from '../../world/operational/execution-governance.contract';

export type ExecutionPolicyHookPayload = FrozenExecutionPolicyHook;

export interface ItineraryGovernanceApplyResult {
  days: ItineraryDay[];
  resultType: ItineraryGenerateResultType;
  partialExecutionState: PartialExecutionState;
  suppressionApplied: boolean;
}

export function shouldSuppressCorridorDriveInjection(hook?: ExecutionPolicyHookPayload | null): boolean {
  if (!hook) return false;
  if (hook.denyLongDistanceAutorouting) return true;
  if (hook.haltAutomatedExecution && hook.executionStatus === 'blocked') return true;
  return false;
}

function classifyGovernance(
  hook: ExecutionPolicyHookPayload | undefined,
  corridorInjectionSuppressed: boolean,
): Pick<ItineraryGovernanceApplyResult, 'resultType' | 'partialExecutionState' | 'suppressionApplied'> {
  if (!hook) {
    return { resultType: 'itinerary', partialExecutionState: 'none', suppressionApplied: false };
  }
  if (hook.haltAutomatedExecution && hook.executionStatus === 'blocked') {
    return { resultType: 'execution_block', partialExecutionState: 'blocked', suppressionApplied: true };
  }
  const suppressionApplied = corridorInjectionSuppressed;
  const partialExecutionState: PartialExecutionState = suppressionApplied ? 'fallback_only' : 'none';
  const needsReplan =
    suppressionApplied &&
    (hook.denyLongDistanceAutorouting || hook.executionStatus === 'dangerous');
  const resultType: ItineraryGenerateResultType = needsReplan ? 'needs_replan' : 'itinerary';
  return { resultType, partialExecutionState, suppressionApplied };
}

export function applyExecutionPolicyHookToItineraryDays(
  days: ItineraryDay[],
  hook: ExecutionPolicyHookPayload | undefined,
  corridorInjectionSuppressed: boolean,
): ItineraryGovernanceApplyResult {
  const { resultType, partialExecutionState, suppressionApplied } = classifyGovernance(
    hook,
    corridorInjectionSuppressed,
  );

  if (!hook) {
    return { days, resultType: 'itinerary', partialExecutionState: 'none', suppressionApplied: false };
  }

  if (resultType === 'execution_block') {
    return { days: [], resultType, partialExecutionState, suppressionApplied };
  }

  const cap = hook.maxSingleLegDriveHours;
  if (cap == null) {
    return { days, resultType, partialExecutionState, suppressionApplied };
  }

  const nextDays = days.map((d) => ({
    ...d,
    items: (d.items ?? []).map((it) => {
      if (it.type !== 'DRIVE') return it;
      const next: ItineraryItem = {
        ...it,
        governance: {
          ...(it.governance ?? {}),
          max_drive_leg_hours: cap,
        },
      };
      return next;
    }),
  }));

  return {
    days: nextDays,
    resultType,
    partialExecutionState,
    suppressionApplied,
  };
}
