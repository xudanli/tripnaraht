/**
 * Reality Read Boundary — pure policy checks (Phase 3 ingress governance).
 *
 * Architecture red lines (human review + future lint):
 * - Direct weather API from decision path without snapshot correlation → blocked under SNAPSHOT_ONLY
 * - Decision tick without snapshot_id when REALITY_ENFORCEMENT → invalid
 * - Narrative layer emitting structured facts → forbidden (projection-only)
 * - Writing reality fields without provenance / confidence → forbidden
 */

import type { DecisionContextV0 } from './decision-context.types';
import type { RealityReadPolicy } from './reality-read-policy.types';
import { evaluateWorldRead } from './reality-policy-engine';

export const ARCHITECTURE_RED_LINES = [
  'direct_external_weather_without_snapshot_binding',
  'routing_provider_call_without_snapshot_correlation',
  'inventory_fetch_without_supply_snapshot_policy',
  'narrative_emitting_structured_world_facts',
  'reality_layer_write_without_provenance',
  'reality_layer_write_without_confidence',
] as const;

export interface WorldReadGateResult {
  allowed: boolean;
  /** When blocked under SNAPSHOT_ONLY */
  reason?: string;
}

/**
 * Whether an adapter may perform a live world read given policy + bound context.
 */
export function evaluateWorldReadGate(params: {
  policy: RealityReadPolicy;
  decisionContext: DecisionContextV0 | undefined;
  component: string;
}): WorldReadGateResult {
  const { policy, decisionContext } = params;
  const r = evaluateWorldRead({
    policy,
    decisionContext,
    boundaryEnabled: true,
  });
  return {
    allowed: r.verdict !== 'BLOCK',
    reason: r.codes.join(','),
  };
}
