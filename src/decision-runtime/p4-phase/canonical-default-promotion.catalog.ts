/**
 * P4 — CANONICAL_DEFAULT promotion gates (SSOT).
 * Legacy-frozen remains optimization Authority until explicit OR-Tools sign-off.
 */

export const CANONICAL_DEFAULT_PROMOTION_VERSION = 'canonical-default-promotion@v1';

export interface CanonicalDefaultPromotionGate {
  gateId: string;
  label: string;
  required: boolean;
  detail: string;
}

export const CANONICAL_DEFAULT_PROMOTION_GATES: CanonicalDefaultPromotionGate[] = [
  {
    gateId: 'selective-closure',
    label: 'P4 selective milestone closed',
    required: true,
    detail: 'artifacts/p4-phase-status/closure.json → CANONICAL_SELECTIVE_READY',
  },
  {
    gateId: 'constraint-majority-on',
    label: 'Constraint scenarios majority ON_FOR_SELECTED',
    required: true,
    detail: '7/7 scenarios in constraint-on-rollout catalog at ON_FOR_SELECTED',
  },
  {
    gateId: 'runtime-canonical-mode',
    label: 'Runtime mode CANONICAL',
    required: true,
    detail: 'DECISION_RUNTIME_MODE=CANONICAL (not merely DECISION_GATEWAY_UNIFIED)',
  },
  {
    gateId: 'constraint-default-on',
    label: 'Constraint Gateway DEFAULT_ON',
    required: true,
    detail: 'CONSTRAINT_GATEWAY_MODE=ON',
  },
  {
    gateId: 'canonical-full-plan',
    label: 'Canonical full plan selection',
    required: true,
    detail: 'CANONICAL_FULL_PLAN_SELECTION=1',
  },
  {
    gateId: 'canonical-execute',
    label: 'Canonical execution path',
    required: true,
    detail: 'CANONICAL_EXECUTION_ENABLED=1 or mode=CANONICAL',
  },
  {
    gateId: 'authorization-gateway',
    label: 'Authorization Gateway enabled',
    required: true,
    detail: 'AUTHORIZATION_POLICY_GATEWAY_ENABLED=1',
  },
  {
    gateId: 'canary-gates',
    label: 'Canary admission gates PASS',
    required: true,
    detail: 'evaluateCanaryAdmissionGates().canaryReady=true',
  },
  {
    gateId: 'legacy-optimization-unchanged',
    label: 'Legacy-frozen optimization Authority',
    required: true,
    detail: 'OPTIMIZATION_STRATEGY_MODE=AUTO (legacy-frozen) unless OR-Tools sign-off',
  },
  {
    gateId: 'observation-window',
    label: 'Selective observation window',
    required: true,
    detail: 'CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS (default 30) after selective closure',
  },
];

export function snapshotCanonicalDefaultPromotionCatalog() {
  return {
    schemaId: 'tripnara.canonical_default_promotion_catalog@v1',
    version: CANONICAL_DEFAULT_PROMOTION_VERSION,
    gateCount: CANONICAL_DEFAULT_PROMOTION_GATES.length,
    gates: CANONICAL_DEFAULT_PROMOTION_GATES,
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'CANONICAL',
      CONSTRAINT_GATEWAY_MODE: 'ON',
      CANONICAL_FULL_PLAN_SELECTION: '1',
      CANONICAL_EXECUTION_ENABLED: '1',
      AUTHORIZATION_POLICY_GATEWAY_ENABLED: '1',
      OPTIMIZATION_STRATEGY_MODE: 'AUTO',
      LEGACY_CONVERGENCE_TARGET: 'CANONICAL_DEFAULT',
    },
  };
}
