/**
 * Proactive Authority — 按 Scenario × Delivery Level 独立授权。
 * 禁止全局 proactive=true。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const PROACTIVE_AUTHORITY_SCHEMA =
  'nara.proactive_authority@v1' as const;

export type DeliveryAuthorityLevel =
  | 'L1_PASSIVE'
  | 'L2_IN_APP_INTERRUPT'
  | 'PUSH'
  | 'SYSTEM_NOTIFICATION';

export type ProactiveAuthorityGrantV1 = {
  schemaId: typeof PROACTIVE_AUTHORITY_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  deliveryLevel: DeliveryAuthorityLevel;
  authorized: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  /** 显式禁止全局开关 */
  globalProactiveForbidden: true;
  autoApplyStillClosed: true;
  autoCancelStillClosed: true;
  autoRerouteStillClosed: true;
  reasonZh: string;
};

export type ProactiveAuthorityRegistryV1 = {
  grants: ProactiveAuthorityGrantV1[];
  globalProactiveTrueForbidden: true;
};

export function createEmptyProactiveAuthorityRegistry(): ProactiveAuthorityRegistryV1 {
  return {
    grants: [],
    globalProactiveTrueForbidden: true,
  };
}

/**
 * 拒绝全局 proactive=true。
 */
export function assertNoGlobalProactiveFlag(input: {
  globalProactive?: boolean;
}): void {
  if (input.globalProactive === true) {
    throw new Error(
      '[ProactiveAuthority] global_proactive_true_forbidden:must_authorize_per_scenario_x_delivery_level',
    );
  }
}

export function grantProactiveAuthority(input: {
  registry: ProactiveAuthorityRegistryV1;
  scenarioId: TemporalScenarioId;
  deliveryLevel: DeliveryAuthorityLevel;
  grantedBy: string;
  reasonZh: string;
  expiresAt?: string;
  grantedAt?: string;
}): ProactiveAuthorityRegistryV1 {
  if (!input.grantedBy.trim()) {
    throw new Error('[ProactiveAuthority] grantedBy_required');
  }
  const grant: ProactiveAuthorityGrantV1 = {
    schemaId: PROACTIVE_AUTHORITY_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    deliveryLevel: input.deliveryLevel,
    authorized: true,
    grantedBy: input.grantedBy,
    grantedAt: input.grantedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt,
    globalProactiveForbidden: true,
    autoApplyStillClosed: true,
    autoCancelStillClosed: true,
    autoRerouteStillClosed: true,
    reasonZh: input.reasonZh,
  };
  const grants = [
    ...input.registry.grants.filter(
      (g) =>
        !(
          g.scenarioId === input.scenarioId &&
          g.deliveryLevel === input.deliveryLevel
        ),
    ),
    grant,
  ];
  return { ...input.registry, grants };
}

export function isProactiveAuthorized(input: {
  registry: ProactiveAuthorityRegistryV1;
  scenarioId: TemporalScenarioId;
  deliveryLevel: DeliveryAuthorityLevel;
  now?: string;
}): boolean {
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const g = input.registry.grants.find(
    (x) =>
      x.scenarioId === input.scenarioId &&
      x.deliveryLevel === input.deliveryLevel &&
      x.authorized,
  );
  if (!g) return false;
  if (g.expiresAt && Date.parse(g.expiresAt) < nowMs) return false;
  return true;
}
