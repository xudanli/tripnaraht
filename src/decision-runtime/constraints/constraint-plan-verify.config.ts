/**
 * Phase 2 — Plan Studio feasibility projection via Gateway PLAN_VERIFY.
 */

import { isPhase6AgentBlockAlwaysDelegated, isPhase6LegacyDeprecationEnabled } from '../phase6-legacy-deprecation.config';

export function isConstraintGatewayPlanVerifyProjectionEnabled(): boolean {
  const v = process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isConstraintCandidateFacadeEnabled(): boolean {
  const v = process.env.CONSTRAINT_CANDIDATE_FACADE?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes' || isConstraintGatewayPlanVerifyProjectionEnabled();
}

/** Phase 2c / Phase 6 — Agent ConstraintsEngineService 不再独立裁决正式 BLOCK */
export function isConstraintAgentBlockDelegated(): boolean {
  const v = process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (isPhase6AgentBlockAlwaysDelegated()) return true;
  return isConstraintGatewayPlanVerifyProjectionEnabled();
}

/** Phase 6 slice-7 — Gateway PLAN_VERIFY 独占 poi_access / schedule / guardian 域（移除 assembler legacy 重复规则） */
export function isPhase6GatewayDomainRulesExclusive(): boolean {
  return (
    isPhase6LegacyDeprecationEnabled() &&
    isConstraintGatewayPlanVerifyProjectionEnabled()
  );
}
