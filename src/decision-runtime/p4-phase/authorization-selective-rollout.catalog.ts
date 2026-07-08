/**
 * P4 — Authorization Gateway selective rollout (paired with constraint ON_FOR_SELECTED).
 */

export const AUTHORIZATION_SELECTIVE_ROLLOUT_VERSION = 'authorization-selective@v1';

export interface AuthorizationSelectiveRolloutEntry {
  scope: 'DECISION' | 'TOOL' | 'EFFECTIVE_PLAN_COMMIT';
  label: string;
  selectiveStagingRequired: boolean;
  productionDefault: 'LEGACY' | 'GATEWAY';
  notes?: string;
}

export const AUTHORIZATION_SELECTIVE_ROLLOUT: AuthorizationSelectiveRolloutEntry[] = [
  {
    scope: 'DECISION',
    label: 'Canonical L2 decision authorization',
    selectiveStagingRequired: true,
    productionDefault: 'LEGACY',
    notes: 'L2 structural changes → ASK',
  },
  {
    scope: 'TOOL',
    label: 'Agent tool execution',
    selectiveStagingRequired: true,
    productionDefault: 'LEGACY',
    notes: 'High-risk tools → ASK',
  },
  {
    scope: 'EFFECTIVE_PLAN_COMMIT',
    label: 'Effective Plan write commit',
    selectiveStagingRequired: true,
    productionDefault: 'LEGACY',
    notes: 'Requires explicit authorization chain',
  },
];

export function snapshotAuthorizationSelectiveRollout() {
  return {
    schemaId: 'tripnara.authorization_selective_rollout@v1',
    version: AUTHORIZATION_SELECTIVE_ROLLOUT_VERSION,
    entryCount: AUTHORIZATION_SELECTIVE_ROLLOUT.length,
    stagingEnvFlag: 'AUTHORIZATION_POLICY_GATEWAY_ENABLED=1',
    entries: AUTHORIZATION_SELECTIVE_ROLLOUT,
  };
}
