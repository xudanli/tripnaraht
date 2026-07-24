/**
 * P4 — Legacy → Canonical convergence ladder (SSOT).
 * @see DECISION_RUNTIME_ROADMAP.md §Phase 4
 */

export const LEGACY_CONVERGENCE_LADDER_VERSION = 'legacy-convergence@v1';

export type LegacyConvergenceStage =
  | 'LEGACY_DEFAULT'
  | 'CANONICAL_SELECTIVE'
  | 'CANONICAL_DEFAULT'
  | 'LEGACY_FALLBACK'
  | 'LEGACY_DEPRECATED';

export interface LegacyConvergenceStageDef {
  stage: LegacyConvergenceStage;
  order: number;
  label: string;
  summary: string;
  /** Env posture hints — not enforced automatically */
  recommendedEnv: Record<string, string>;
  exitCriteria: string[];
}

export const LEGACY_CONVERGENCE_LADDER: LegacyConvergenceStageDef[] = [
  {
    stage: 'LEGACY_DEFAULT',
    order: 1,
    label: 'Legacy default authority',
    summary: 'Legacy-frozen optimization + legacy boolean constraint authority.',
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'LEGACY',
      OPTIMIZATION_STRATEGY_MODE: 'AUTO',
      CONSTRAINT_GATEWAY_MODE: 'OFF',
    },
    exitCriteria: [
      'P2 canary gates PASS',
      'P3 monitoring closure READY_FOR_P4',
      'Constraint SHADOW_COMPARE metrics stable',
    ],
  },
  {
    stage: 'CANONICAL_SELECTIVE',
    order: 2,
    label: 'Canonical selective rollout',
    summary:
      'Canonical path for selected scenarios (constraint ON_FOR_SELECTED, trigger gateway, bounded LNS). Legacy remains default fallback.',
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'SHADOW',
      CONSTRAINT_GATEWAY_MODE: 'ON_FOR_SELECTED',
      CONSTRAINT_GATEWAY_ON_SCENARIOS:
        'iceland-road-closed,weather-outdoor-storm,daily-load-excessive,in-trip-replan,full-plan-selection,guide-plan-selection,opening-hours-conflict',
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      REPLANNING_TRIGGER_POLICY_ENABLED: '1',
      BOUNDED_LNS_REPAIR_ENABLED: '1',
      AUTHORIZATION_POLICY_GATEWAY_ENABLED: '1',
      DECISION_PACK_RULES: '1',
    },
    exitCriteria: [
      'All ON_FOR_SELECTED scenarios pass staging probes',
      'No L1 regression in shadow metrics',
      'Trigger center lineage observable per trip',
      'Holdout blind review non-inferior',
    ],
  },
  {
    stage: 'CANONICAL_DEFAULT',
    order: 3,
    label: 'Canonical default authority',
    summary: 'DECISION_RUNTIME_MODE=CANONICAL + constraint DEFAULT_ON for formal paths.',
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'CANONICAL',
      CONSTRAINT_GATEWAY_MODE: 'ON',
      CANONICAL_FULL_PLAN_SELECTION: '1',
      CANONICAL_EXECUTION_ENABLED: '1',
    },
    exitCriteria: [
      'Canary admission sustained 30d',
      'Executor bypass count = 0 in architecture lint',
      'Lex remains shadow-only unless OR-Tools sign-off',
    ],
  },
  {
    stage: 'LEGACY_FALLBACK',
    order: 4,
    label: 'Legacy fallback only',
    summary: 'Canonical default with instant env rollback to legacy-frozen.',
    recommendedEnv: {
      DECISION_RUNTIME_MODE: 'CANONICAL',
      OPTIMIZATION_STRATEGY_MODE: 'LEGACY',
    },
    exitCriteria: [
      'Documented rollback runbook validated',
      'Legacy path used only on explicit fallback flag',
    ],
  },
  {
    stage: 'LEGACY_DEPRECATED',
    order: 5,
    label: 'Legacy deprecated',
    summary: 'Legacy boolean + legacy-frozen removed from formal paths.',
    recommendedEnv: {},
    exitCriteria: [
      'All constraint rollout entries LEGACY_DEPRECATED',
      'No production caller on legacy boolean',
      'Architecture lint green for 90d',
    ],
  },
];

export function snapshotLegacyConvergenceLadder() {
  return {
    schemaId: 'tripnara.legacy_convergence_ladder@v1',
    version: LEGACY_CONVERGENCE_LADDER_VERSION,
    stageCount: LEGACY_CONVERGENCE_LADDER.length,
    stages: LEGACY_CONVERGENCE_LADDER,
  };
}

export function stageOrder(stage: LegacyConvergenceStage): number {
  return LEGACY_CONVERGENCE_LADDER.find((s) => s.stage === stage)?.order ?? 0;
}
