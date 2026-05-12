/**
 * Execution Gate — sole authority for whether this tick’s execution may proceed.
 * PolicyEngine produces verdicts; ExecutionGate binds reality layer + policy into ExecutionDecision.
 */

import type { RealityPolicyCode } from './reality-policy-engine.types';

export type ExecutionGateKind = 'planning_tick' | 'repair' | 'world_read';

/**
 * Unified degradation semantics — modules must not invent local degrade behavior.
 * - PLANNING_HEURISTIC_ONLY: no live geo/weather/routing providers; snapshot + heuristics only.
 * - WORLD_READ_BOUND_AUDIT: live read allowed only after gate + audit path (boundary DEGRADE / bypass).
 */
export type DegradeStrategy = 'PLANNING_HEURISTIC_ONLY' | 'WORLD_READ_BOUND_AUDIT';

export type ExecutionDecision =
  | { type: 'ALLOW' }
  | { type: 'DEGRADE'; strategy: DegradeStrategy }
  | { type: 'BLOCK'; reason: string; codes: RealityPolicyCode[] };
