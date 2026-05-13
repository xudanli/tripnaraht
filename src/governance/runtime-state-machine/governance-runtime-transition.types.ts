import type { GovernanceRuntimeState } from './governance-runtime-state.types';

/** Authoritative transition signal (not branch-outcome taxonomy). */
export type GovernanceRuntimeTransitionEvent =
  | 'world_escalated'
  | 'execution_blocked'
  | 'replanning_started'
  | 'replanning_succeeded'
  | 'replanning_failed'
  | 'confirmation_rejected'
  | 'execution_resumed'
  /** Internal SM signal when execution is suppressed at the orchestration boundary. */
  | 'execution_suppressed';

export interface GovernanceRuntimeTransition {
  fromState: GovernanceRuntimeState;
  event: GovernanceRuntimeTransitionEvent;
  toState: GovernanceRuntimeState;
  transitionReasonCodes: string[];
}
