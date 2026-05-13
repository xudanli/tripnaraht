import type { GovernanceRuntimeState } from './governance-runtime-state.types';
import type { GovernanceRuntimeTransitionEvent } from './governance-runtime-transition.types';

const KEY = (from: GovernanceRuntimeState, ev: GovernanceRuntimeTransitionEvent) => `${from}::${ev}`;

/** Deterministic v1 transition table (extend only here). */
const TABLE = new Map<string, GovernanceRuntimeState>([
  [KEY('NORMAL', 'world_escalated'), 'RESTRICTED'],
  [KEY('NORMAL', 'execution_blocked'), 'RESTRICTED'],
  [KEY('NORMAL', 'replanning_started'), 'REPLANNING'],
  [KEY('NORMAL', 'execution_suppressed'), 'HALTED'],
  [KEY('RESTRICTED', 'world_escalated'), 'RESTRICTED'],
  [KEY('RESTRICTED', 'execution_blocked'), 'RESTRICTED'],
  [KEY('RESTRICTED', 'replanning_started'), 'REPLANNING'],
  [KEY('RESTRICTED', 'confirmation_rejected'), 'NORMAL'],
  [KEY('RESTRICTED', 'execution_resumed'), 'NORMAL'],
  [KEY('BLOCKED', 'replanning_started'), 'REPLANNING'],
  [KEY('BLOCKED', 'execution_blocked'), 'BLOCKED'],
  [KEY('BLOCKED', 'confirmation_rejected'), 'RESTRICTED'],
  [KEY('REPLANNING', 'replanning_succeeded'), 'RECOVERING'],
  [KEY('REPLANNING', 'replanning_failed'), 'RESTRICTED'],
  [KEY('RECOVERING', 'execution_resumed'), 'NORMAL'],
  [KEY('HALTED', 'replanning_started'), 'REPLANNING'],
  [KEY('HALTED', 'execution_resumed'), 'RESTRICTED'],
]);

export function resolveGovernanceRuntimeTransitionTarget(
  from: GovernanceRuntimeState,
  event: GovernanceRuntimeTransitionEvent,
): GovernanceRuntimeState | null {
  return TABLE.get(KEY(from, event)) ?? null;
}
