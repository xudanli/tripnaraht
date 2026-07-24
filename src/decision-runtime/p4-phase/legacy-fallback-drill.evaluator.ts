/**
 * P4 — LEGACY_FALLBACK drill evaluation (rollback posture validation).
 */

import type { DecisionRuntimeCapabilitiesInput } from '../execution/decision-runtime-capabilities.util';
import {
  buildCanonicalDefaultPreviewCapabilities,
} from './canonical-default-promotion.evaluator';
import {
  evaluateLegacyConvergence,
  inferLegacyConvergenceStage,
} from './legacy-convergence.evaluator';
import { snapshotLegacyConvergenceLadder } from './legacy-convergence-ladder.catalog';

export const LEGACY_FALLBACK_DRILL_SCHEMA_ID = 'tripnara.legacy_fallback_drill@v1';

export type RollbackTier = 'LEGACY_FALLBACK' | 'CANONICAL_SELECTIVE' | 'LEGACY_DEFAULT';

export interface RollbackTierResult {
  tier: RollbackTier;
  label: string;
  stage: ReturnType<typeof inferLegacyConvergenceStage>;
  recommendedEnv: Record<string, string>;
  restartRequired: boolean;
  effectivePlanWrites: boolean;
}

/** Tier A — keep Canonical runtime; optimization authority → legacy-frozen */
export function buildLegacyFallbackCapabilities(
  base: DecisionRuntimeCapabilitiesInput,
): DecisionRuntimeCapabilitiesInput {
  return {
    ...buildCanonicalDefaultPreviewCapabilities(base),
    optimizationStrategyMode: 'LEGACY',
  };
}

/** Tier B — selective canonical (production-safe partial rollback) */
export function buildCanonicalSelectiveRollbackCapabilities(
  base: DecisionRuntimeCapabilitiesInput,
): DecisionRuntimeCapabilitiesInput {
  return {
    ...base,
    mode: 'SHADOW',
    constraintGateway: true,
    constraintGatewayMode: 'ON_FOR_SELECTED',
    constraintGatewayShadowCompare: false,
    constraintGatewayOnForSelected: true,
    fullPlanSelection: false,
    guideCanonicalSelection: false,
    guideCanonicalAcceptExecute: false,
    canonicalExecute: false,
    authorizationPolicyGateway: true,
    decisionTriggerGateway: true,
    replanningTriggerPolicy: true,
    optimizationStrategyMode: 'AUTO',
  };
}

/** Tier C — full legacy authority */
export function buildLegacyDefaultRollbackCapabilities(
  base: DecisionRuntimeCapabilitiesInput,
): DecisionRuntimeCapabilitiesInput {
  return {
    ...base,
    mode: 'LEGACY',
    constraintGateway: false,
    constraintGatewayMode: 'OFF',
    constraintGatewayShadowCompare: false,
    constraintGatewayOnForSelected: false,
    fullPlanSelection: false,
    guideCanonicalSelection: false,
    guideCanonicalAcceptExecute: false,
    canonicalExecute: false,
    authorizationPolicyGateway: false,
    decisionTriggerGateway: false,
    replanningTriggerPolicy: false,
    optimizationStrategyMode: 'AUTO',
  };
}

const ROLLBACK_TIERS: Array<{
  tier: RollbackTier;
  label: string;
  build: (base: DecisionRuntimeCapabilitiesInput) => DecisionRuntimeCapabilitiesInput;
  env: Record<string, string>;
  restartRequired: boolean;
  effectivePlanWrites: boolean;
}> = [
  {
    tier: 'LEGACY_FALLBACK',
    label: 'Optimization → legacy-frozen (runtime stays CANONICAL)',
    build: buildLegacyFallbackCapabilities,
    env: {
      DECISION_RUNTIME_MODE: 'CANONICAL',
      OPTIMIZATION_STRATEGY_MODE: 'LEGACY',
      CONSTRAINT_GATEWAY_MODE: 'ON',
      CANONICAL_FULL_PLAN_SELECTION: '1',
      CANONICAL_EXECUTION_ENABLED: '1',
    },
    restartRequired: true,
    effectivePlanWrites: true,
  },
  {
    tier: 'CANONICAL_SELECTIVE',
    label: 'Selective canonical (SHADOW + ON_FOR_SELECTED)',
    build: buildCanonicalSelectiveRollbackCapabilities,
    env: {
      DECISION_RUNTIME_MODE: 'SHADOW',
      CONSTRAINT_GATEWAY_MODE: 'ON_FOR_SELECTED',
      CONSTRAINT_GATEWAY_ON_SCENARIOS:
        'iceland-road-closed,weather-outdoor-storm,daily-load-excessive,in-trip-replan,full-plan-selection,guide-plan-selection,opening-hours-conflict',
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      REPLANNING_TRIGGER_POLICY_ENABLED: '1',
      AUTHORIZATION_POLICY_GATEWAY_ENABLED: '1',
      CANONICAL_FULL_PLAN_SELECTION: '0',
      CANONICAL_EXECUTION_ENABLED: '0',
      OPTIMIZATION_STRATEGY_MODE: 'AUTO',
    },
    restartRequired: true,
    effectivePlanWrites: false,
  },
  {
    tier: 'LEGACY_DEFAULT',
    label: 'Full legacy authority',
    build: buildLegacyDefaultRollbackCapabilities,
    env: {
      DECISION_RUNTIME_MODE: 'LEGACY',
      CONSTRAINT_GATEWAY_MODE: 'OFF',
      CONSTRAINT_EVALUATION_GATEWAY_ENABLED: '0',
      CANONICAL_FULL_PLAN_SELECTION: '0',
      CANONICAL_EXECUTION_ENABLED: '0',
      DECISION_TRIGGER_GATEWAY_ENABLED: '0',
      OPTIMIZATION_STRATEGY_MODE: 'AUTO',
    },
    restartRequired: true,
    effectivePlanWrites: false,
  },
];

export function evaluateLegacyFallbackDrill(
  base: DecisionRuntimeCapabilitiesInput = {} as DecisionRuntimeCapabilitiesInput,
) {
  const tiers: RollbackTierResult[] = ROLLBACK_TIERS.map((def) => {
    const caps = def.build(base);
    return {
      tier: def.tier,
      label: def.label,
      stage: inferLegacyConvergenceStage(caps),
      recommendedEnv: def.env,
      restartRequired: def.restartRequired,
      effectivePlanWrites: def.effectivePlanWrites,
    };
  });

  const tierA = tiers.find((t) => t.tier === 'LEGACY_FALLBACK')!;
  const tierB = tiers.find((t) => t.tier === 'CANONICAL_SELECTIVE')!;
  const tierC = tiers.find((t) => t.tier === 'LEGACY_DEFAULT')!;

  const blockers: string[] = [];
  if (tierA.stage !== 'LEGACY_FALLBACK') {
    blockers.push('tier-A stage mismatch');
  }
  if (tierB.stage !== 'CANONICAL_SELECTIVE') {
    blockers.push('tier-B stage mismatch');
  }
  if (tierC.stage !== 'LEGACY_DEFAULT') {
    blockers.push('tier-C stage mismatch');
  }

  const convergenceAtDefault = evaluateLegacyConvergence(
    buildCanonicalDefaultPreviewCapabilities(base),
  );

  return {
    schemaId: LEGACY_FALLBACK_DRILL_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    blockers,
    tiers,
    ladder: snapshotLegacyConvergenceLadder(),
    preFlipStage: convergenceAtDefault.currentStage,
    drillPass: blockers.length === 0,
  };
}

export function snapshotRollbackTierCatalog() {
  return {
    schemaId: 'tripnara.rollback_tier_catalog@v1',
    tierCount: ROLLBACK_TIERS.length,
    tiers: ROLLBACK_TIERS.map((t) => ({
      tier: t.tier,
      label: t.label,
      recommendedEnv: t.env,
      restartRequired: t.restartRequired,
      effectivePlanWrites: t.effectivePlanWrites,
    })),
  };
}
