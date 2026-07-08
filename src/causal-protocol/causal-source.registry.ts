/**
 * Registered causal signal sources — adapters MUST map into facts/effects, not UI strings.
 */

export const CAUSAL_SOURCE_REGISTRY = {
  ICELAND_SELF_DRIVE_RUNTIME: 'iceland.self_drive_causal',
  READINESS_CASCADE: 'readiness.cascade_preanalysis',
  DECISION_CHECKER: 'decision_checker.feasibility',
  GATEWAY_ASSERTION: 'gateway.problem_assertion',
  TRAVEL_WORLD_FACT: 'travel_world_fact',
  LEGACY_BFF_PROJECTION: 'legacy.bff_projection',
} as const;

export type CausalSourceId = (typeof CAUSAL_SOURCE_REGISTRY)[keyof typeof CAUSAL_SOURCE_REGISTRY];
