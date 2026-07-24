/**
 * P5 — LEGACY_DEPRECATED readiness gates (SSOT).
 * Preconditions before retiring legacy boolean + legacy-frozen paths.
 */

export const LEGACY_DEPRECATED_READINESS_VERSION = 'legacy-deprecated-readiness@v1';

export interface LegacyDeprecatedReadinessGate {
  gateId: string;
  label: string;
  required: boolean;
  detail: string;
}

export const LEGACY_DEPRECATED_READINESS_GATES: LegacyDeprecatedReadinessGate[] = [
  {
    gateId: 'canonical-default-production',
    label: 'CANONICAL_DEFAULT in production',
    required: true,
    detail: 'Production flip completed; runtime mode CANONICAL + constraint ON sustained',
  },
  {
    gateId: 'constraint-all-default-on',
    label: 'All constraint scenarios DEFAULT_ON',
    required: true,
    detail: 'constraint-on-rollout catalog: all entries LEGACY_DEPRECATED or DEFAULT_ON',
  },
  {
    gateId: 'legacy-boolean-callers-zero',
    label: 'No production caller on legacy boolean',
    required: true,
    detail: 'Architecture lint: ConstraintChecker direct authority = 0 for formal paths',
  },
  {
    gateId: 'optimization-sign-off',
    label: 'OR-Tools / Lex sign-off OR legacy-frozen retired',
    required: true,
    detail: 'OPTIMIZATION_STRATEGY_MODE not locked to AUTO legacy-frozen by policy',
  },
  {
    gateId: 'rollback-runbook-drill',
    label: 'LEGACY_FALLBACK drill sustained',
    required: true,
    detail: 'artifacts/p4-legacy-fallback-drill/report.json drillPass=true quarterly',
  },
  {
    gateId: 'architecture-lint-90d',
    label: 'Architecture lint green 90d',
    required: true,
    detail: 'No executor bypass; effective plan guard enforced',
  },
];

export function snapshotLegacyDeprecatedReadinessCatalog() {
  return {
    schemaId: 'tripnara.legacy_deprecated_readiness_catalog@v1',
    version: LEGACY_DEPRECATED_READINESS_VERSION,
    gateCount: LEGACY_DEPRECATED_READINESS_GATES.length,
    gates: LEGACY_DEPRECATED_READINESS_GATES,
  };
}
