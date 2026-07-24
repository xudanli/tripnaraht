/**
 * Verifies live runtime-capabilities match Production Cutover target posture.
 * Checks parsed runtime — not env file text alone.
 */

import { PRODUCTION_CUTOVER_TARGET } from './production-cutover.catalog';
import type { ProductionTransitionPhaseSnapshot } from './production-transition-phase.catalog';

export const CUTOVER_RUNTIME_VERIFY_SCHEMA_ID =
  'tripnara.production_cutover_runtime_verify@v1';

export interface CutoverRuntimeCapsInput {
  mode?: string;
  optimizationStrategyMode?: string;
  constraintGatewayMode?: string;
  decisionTriggerGateway?: boolean;
  authorizationPolicyGateway?: boolean;
  replanningTriggerPolicy?: boolean;
  effectivePlanWriteGuard?: boolean;
  productionTransition?: ProductionTransitionPhaseSnapshot;
}

export interface CutoverRuntimeCheck {
  id: string;
  label: string;
  pass: boolean;
  expected: string;
  actual: string;
}

export interface CutoverRuntimeVerifyResult {
  schemaId: typeof CUTOVER_RUNTIME_VERIFY_SCHEMA_ID;
  pass: boolean;
  checks: CutoverRuntimeCheck[];
  blockers: string[];
  /** Pre-cutover: system still on Legacy before applying cutover env. */
  expectedLegacyBeforeCutover?: boolean;
}

/** LEGACY_FROZEN env → optimizationStrategyMode LEGACY in resolver. */
const ACCEPTABLE_OPTIMIZATION = new Set(['LEGACY', 'AUTO']);

/**
 * Pre-cutover gate — live system must NOT already be on Canonical cutover posture.
 */
export function verifyPreCutoverRuntimePosture(
  caps: CutoverRuntimeCapsInput,
): CutoverRuntimeVerifyResult {
  const phase = caps.productionTransition;
  const isCanonicalCutover =
    caps.mode === 'CANONICAL' &&
    phase?.currentAuthority === PRODUCTION_CUTOVER_TARGET.CURRENT_AUTHORITY &&
    phase?.canonicalRollout === PRODUCTION_CUTOVER_TARGET.CANONICAL_ROLLOUT &&
    phase?.decisionRuntimePhase === PRODUCTION_CUTOVER_TARGET.DECISION_RUNTIME_PHASE;

  const checks: CutoverRuntimeCheck[] = [
    {
      id: 'runtime-posture-pre',
      label: 'Pre-cutover runtime posture',
      pass: !isCanonicalCutover,
      expected: 'EXPECTED_LEGACY_BEFORE_CUTOVER (not yet Canonical cutover)',
      actual: isCanonicalCutover
        ? `ALREADY_CANONICAL phase=${phase?.decisionRuntimePhase} authority=${phase?.currentAuthority}`
        : `LEGACY_OR_PRE_CUTOVER mode=${caps.mode ?? '?'} authority=${phase?.currentAuthority ?? '?'}`,
    },
    {
      id: 'authority-not-canonical-yet',
      label: 'CURRENT_AUTHORITY not CANONICAL yet',
      pass: phase?.currentAuthority !== PRODUCTION_CUTOVER_TARGET.CURRENT_AUTHORITY,
      expected: 'LEGACY or non-CANONICAL',
      actual: String(phase?.currentAuthority ?? 'missing'),
    },
  ];

  const blockers = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    schemaId: CUTOVER_RUNTIME_VERIFY_SCHEMA_ID,
    pass: blockers.length === 0,
    checks,
    blockers,
    expectedLegacyBeforeCutover: true,
  };
}

export function verifyCutoverRuntimePosture(
  caps: CutoverRuntimeCapsInput,
): CutoverRuntimeVerifyResult {
  const phase = caps.productionTransition;
  const checks: CutoverRuntimeCheck[] = [
    {
      id: 'runtime-mode',
      label: 'DECISION_RUNTIME_MODE',
      pass: caps.mode === 'CANONICAL',
      expected: 'CANONICAL',
      actual: String(caps.mode ?? 'missing'),
    },
    {
      id: 'current-authority',
      label: 'CURRENT_AUTHORITY',
      pass: phase?.currentAuthority === PRODUCTION_CUTOVER_TARGET.CURRENT_AUTHORITY,
      expected: PRODUCTION_CUTOVER_TARGET.CURRENT_AUTHORITY,
      actual: String(phase?.currentAuthority ?? 'missing'),
    },
    {
      id: 'canonical-rollout',
      label: 'CANONICAL_ROLLOUT',
      pass: phase?.canonicalRollout === PRODUCTION_CUTOVER_TARGET.CANONICAL_ROLLOUT,
      expected: PRODUCTION_CUTOVER_TARGET.CANONICAL_ROLLOUT,
      actual: String(phase?.canonicalRollout ?? 'missing'),
    },
    {
      id: 'runtime-phase',
      label: 'DECISION_RUNTIME_PHASE',
      pass: phase?.decisionRuntimePhase === PRODUCTION_CUTOVER_TARGET.DECISION_RUNTIME_PHASE,
      expected: PRODUCTION_CUTOVER_TARGET.DECISION_RUNTIME_PHASE,
      actual: String(phase?.decisionRuntimePhase ?? 'missing'),
    },
    {
      id: 'lex-role',
      label: 'LEX_ROLE',
      pass: phase?.lexRole === PRODUCTION_CUTOVER_TARGET.LEX_ROLE,
      expected: PRODUCTION_CUTOVER_TARGET.LEX_ROLE,
      actual: String(phase?.lexRole ?? 'missing'),
    },
    {
      id: 'optimization-strategy',
      label: 'OPTIMIZATION_STRATEGY_MODE (legacy-frozen authority)',
      pass: ACCEPTABLE_OPTIMIZATION.has(String(caps.optimizationStrategyMode ?? '')),
      expected: 'LEGACY or AUTO (legacy-frozen)',
      actual: String(caps.optimizationStrategyMode ?? 'missing'),
    },
    {
      id: 'constraint-gateway',
      label: 'CONSTRAINT_GATEWAY_MODE (selective)',
      pass: caps.constraintGatewayMode === PRODUCTION_CUTOVER_TARGET.CONSTRAINT_GATEWAY_MODE,
      expected: PRODUCTION_CUTOVER_TARGET.CONSTRAINT_GATEWAY_MODE,
      actual: String(caps.constraintGatewayMode ?? 'missing'),
    },
    {
      id: 'trigger-gateway',
      label: 'DECISION_TRIGGER_GATEWAY_ENABLED',
      pass: caps.decisionTriggerGateway === true,
      expected: 'true',
      actual: String(caps.decisionTriggerGateway ?? false),
    },
    {
      id: 'authorization-gateway',
      label: 'AUTHORIZATION_POLICY_GATEWAY_ENABLED',
      pass: caps.authorizationPolicyGateway === true,
      expected: 'true',
      actual: String(caps.authorizationPolicyGateway ?? false),
    },
    {
      id: 'replanning-off',
      label: 'REPLANNING_TRIGGER_POLICY_ENABLED',
      pass: caps.replanningTriggerPolicy !== true,
      expected: 'false',
      actual: String(caps.replanningTriggerPolicy ?? false),
    },
    {
      id: 'write-guard',
      label: 'EFFECTIVE_PLAN_WRITE_GUARD',
      pass: caps.effectivePlanWriteGuard === true,
      expected: 'true',
      actual: String(caps.effectivePlanWriteGuard ?? false),
    },
    {
      id: 'lex-not-authority',
      label: 'Lex remains shadow (not optimization authority)',
      pass: phase?.lexRole === 'SHADOW_ONLY' && phase?.optimizationAuthority === 'legacy-frozen',
      expected: 'SHADOW_ONLY + legacy-frozen',
      actual: `${phase?.lexRole ?? '?'} / ${phase?.optimizationAuthority ?? '?'}`,
    },
  ];

  const blockers = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    schemaId: CUTOVER_RUNTIME_VERIFY_SCHEMA_ID,
    pass: blockers.length === 0,
    checks,
    blockers,
  };
}
