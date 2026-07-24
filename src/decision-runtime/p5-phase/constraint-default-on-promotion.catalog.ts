/**
 * P5 — Constraint scenario DEFAULT_ON promotion gates (post CANONICAL_DEFAULT flip).
 */

export const CONSTRAINT_DEFAULT_ON_PROMOTION_VERSION = 'constraint-default-on-promotion@v1';

export interface ConstraintDefaultOnPromotionGate {
  gateId: string;
  label: string;
  required: boolean;
  detail: string;
}

export const CONSTRAINT_DEFAULT_ON_PROMOTION_GATES: ConstraintDefaultOnPromotionGate[] = [
  {
    gateId: 'canonical-default-staging',
    label: 'CANONICAL_DEFAULT staging closed',
    required: true,
    detail: 'artifacts/p4-canonical-default-status/closure.json → CANONICAL_DEFAULT_STAGING_READY',
  },
  {
    gateId: 'constraint-gateway-on',
    label: 'Constraint Gateway DEFAULT_ON',
    required: true,
    detail: 'CONSTRAINT_GATEWAY_MODE=ON (not ON_FOR_SELECTED)',
  },
  {
    gateId: 'all-on-for-selected',
    label: 'All scenarios ON_FOR_SELECTED',
    required: true,
    detail: '7/7 constraint-on-rollout catalog at ON_FOR_SELECTED before DEFAULT_ON',
  },
  {
    gateId: 'shadow-staging-clean',
    label: 'Shadow staging probes PASS',
    required: true,
    detail: 'artifacts/constraint-shadow-staging/report.json all probes pass',
  },
  {
    gateId: 'architecture-lint',
    label: 'Architecture lint PASS',
    required: true,
    detail: 'artifacts/p5-architecture-lint/report.json pass=true',
  },
];

export function snapshotConstraintDefaultOnPromotionCatalog() {
  return {
    schemaId: 'tripnara.constraint_default_on_promotion_catalog@v1',
    version: CONSTRAINT_DEFAULT_ON_PROMOTION_VERSION,
    gateCount: CONSTRAINT_DEFAULT_ON_PROMOTION_GATES.length,
    gates: CONSTRAINT_DEFAULT_ON_PROMOTION_GATES,
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'CANONICAL',
      CONSTRAINT_GATEWAY_MODE: 'ON',
      CONSTRAINT_EVALUATION_GATEWAY_ENABLED: '1',
    },
    nextPhase: 'LEGACY_DEPRECATED',
  };
}
