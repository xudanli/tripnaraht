/**
 * Target rollout model for all Decision Runtime gateways.
 * Constraint already uses mode enum; others migrate from boolean flags.
 *
 * @see PRODUCTION_TRANSITION.md §7
 */

export type GatewayRolloutMode = 'OFF' | 'SHADOW' | 'SELECTIVE' | 'ON';

export type GatewayRolloutTarget =
  | 'trigger'
  | 'authorization'
  | 'replanning_trigger_policy'
  | 'constraint'
  | 'agent_provider';

export interface GatewayRolloutEnvMapping {
  gateway: GatewayRolloutTarget;
  /** Current boolean / legacy env vars */
  legacyEnvVars: string[];
  /** Target unified env (not yet wired everywhere) */
  targetEnvVar: string;
  notes?: string;
}

/** Documented migration map — production transition SSOT */
export const GATEWAY_ROLLOUT_ENV_MAPPINGS: GatewayRolloutEnvMapping[] = [
  {
    gateway: 'trigger',
    legacyEnvVars: ['DECISION_TRIGGER_GATEWAY_ENABLED', 'DECISION_TRIGGER_LINEAGE_ENABLED'],
    targetEnvVar: 'TRIGGER_GATEWAY_MODE',
    notes: 'SELECTIVE = dispatch on catalog subset; SHADOW = lineage + metrics only',
  },
  {
    gateway: 'authorization',
    legacyEnvVars: ['AUTHORIZATION_POLICY_GATEWAY_ENABLED'],
    targetEnvVar: 'AUTHORIZATION_GATEWAY_MODE',
  },
  {
    gateway: 'replanning_trigger_policy',
    legacyEnvVars: ['REPLANNING_TRIGGER_POLICY_ENABLED'],
    targetEnvVar: 'REPLANNING_POLICY_MODE',
  },
  {
    gateway: 'constraint',
    legacyEnvVars: ['CONSTRAINT_GATEWAY_MODE', 'CONSTRAINT_EVALUATION_GATEWAY_ENABLED'],
    targetEnvVar: 'CONSTRAINT_GATEWAY_MODE',
    notes: 'Already on mode enum; SHADOW_COMPARE maps to SHADOW',
  },
  {
    gateway: 'agent_provider',
    legacyEnvVars: [],
    targetEnvVar: 'AGENT_PROVIDER_MODE',
    notes: 'Per-provider SELECTIVE rollout via registry',
  },
];

export function snapshotGatewayRolloutCatalog() {
  return {
    schemaId: 'tripnara.gateway_rollout_catalog@v1',
    mode: 'OFF | SHADOW | SELECTIVE | ON' as const,
    mappings: GATEWAY_ROLLOUT_ENV_MAPPINGS,
  };
}
