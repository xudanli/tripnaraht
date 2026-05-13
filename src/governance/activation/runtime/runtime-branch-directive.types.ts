import type { ReplanningIntent } from '../governance-activation.types';

/**
 * Single runtime branch contract — orchestration reads only this (not raw activations).
 */
export interface RuntimeBranchDirective {
  branchType: 'normal_execution' | 'replanning' | 'halted' | 'needs_confirmation';
  /** Stable handles for the activation rows that won precedence (v1: type-prefixed). */
  sourceActivationIds: string[];
  replanningIntent?: ReplanningIntent;
}
