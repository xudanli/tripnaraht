/**
 * P2 — Optimization CANARY rollout governance (design SSOT).
 * Legacy-frozen remains production Authority until explicit Phase 4 convergence.
 */

export const CANARY_ROLLOUT_GOVERNANCE_VERSION = 'canary-rollout@v1';

export interface CanaryRolloutRule {
  ruleId: string;
  label: string;
  enforced: boolean;
  detail: string;
}

export const CANARY_ROLLOUT_RULES: CanaryRolloutRule[] = [
  {
    ruleId: 'LEGACY_AUTHORITY_UNCHANGED',
    label: 'Legacy-frozen stays production Authority',
    enforced: true,
    detail: 'DECISION_RUNTIME_MODE=CANARY maps to DUAL_RUN; no automatic Lex authority flip',
  },
  {
    ruleId: 'CANARY_GATES_REQUIRED',
    label: 'All required canary admission gates PASS',
    enforced: true,
    detail: 'npm run p2-phase:status → canaryAdmission.canaryReady=true',
  },
  {
    ruleId: 'HOLDOUT_BLIND_REVIEW',
    label: 'Holdout materialized cases reviewed',
    enforced: true,
    detail: 'holdout-summary.json blindReviewSubmitted === materializedReviewCases',
  },
  {
    ruleId: 'CONSTRAINT_ON_SELECTED_ONLY',
    label: 'Constraint canonical authority only via ON_FOR_SELECTED',
    enforced: true,
    detail: 'CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED + CONSTRAINT_GATEWAY_ON_SCENARIOS=...',
  },
  {
    ruleId: 'NO_SHADOW_EFFECTIVE_WRITE',
    label: 'Shadow / CANARY never writes Effective Plan',
    enforced: true,
    detail: 'RFC001_SHADOW_MODE=1 or SHADOW runtime on :3001 only',
  },
  {
    ruleId: 'ROLLBACK_SWITCH',
    label: 'Instant rollback via env',
    enforced: true,
    detail: 'Unset CANARY flags → LEGACY / OFF; no code deploy required',
  },
];

export function snapshotCanaryRolloutGovernance() {
  return {
    schemaId: 'tripnara.canary_rollout_governance@v1',
    version: CANARY_ROLLOUT_GOVERNANCE_VERSION,
    ruleCount: CANARY_ROLLOUT_RULES.length,
    rules: CANARY_ROLLOUT_RULES,
    recommendedStagingEnv: {
      DECISION_RUNTIME_MODE: 'SHADOW',
      CONSTRAINT_GATEWAY_MODE: 'ON_FOR_SELECTED',
      CONSTRAINT_GATEWAY_ON_SCENARIOS:
        'iceland-road-closed,weather-outdoor-storm,daily-load-excessive',
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      AUTHORIZATION_POLICY_GATEWAY_ENABLED: '1',
      DECISION_PACK_RULES: '1',
    },
  };
}
