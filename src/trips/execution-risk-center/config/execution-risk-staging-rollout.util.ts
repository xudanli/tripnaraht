import {
  isExecutionRiskApplyEffectivePlanEnabled,
  isExecutionRiskConfirmWriteEnabled,
  isExecutionRiskItineraryMaterializeEnabled,
  isExecutionRiskRfc001WriteAdapterEnabled,
  readExecutionRiskFeatureFlags,
} from './execution-risk-feature-flags.util';
import { readExecutionRiskWriteAllowlist } from './execution-risk-write-allowlist.util';

/** Production rollout ladder — advance one phase at a time in staging. */
export type ExecutionRiskStagingPhase =
  | 'OFF'
  | 'PHASE_1_MATERIALIZE_ONLY'
  | 'PHASE_2_EFFECTIVE_ACTIVATE'
  | 'PHASE_3_ALLOWLISTED_PRODUCTION';

export interface ExecutionRiskStagingPhaseSpec {
  phase: ExecutionRiskStagingPhase;
  label: string;
  requiredFlags: Record<string, boolean>;
  notes: string[];
}

export const EXECUTION_RISK_STAGING_PHASES: ExecutionRiskStagingPhaseSpec[] = [
  {
    phase: 'OFF',
    label: 'Feature Complete / Production Gated (default)',
    requiredFlags: {
      EXECUTION_RISK_CONFIRM_WRITE_ENABLED: false,
      EXECUTION_RISK_RFC001_WRITE_ADAPTER: false,
      EXECUTION_RISK_APPLY_EFFECTIVE_PLAN: false,
      EXECUTION_RISK_ITINERARY_MATERIALIZE: false,
    },
    notes: ['Harness + AC green; no production write-back'],
  },
  {
    phase: 'PHASE_1_MATERIALIZE_ONLY',
    label: 'Staging Phase 1 — materialize without effective activate',
    requiredFlags: {
      EXECUTION_RISK_CONFIRM_WRITE_ENABLED: true,
      EXECUTION_RISK_RFC001_WRITE_ADAPTER: true,
      EXECUTION_RISK_ITINERARY_MATERIALIZE: true,
      EXECUTION_RISK_APPLY_EFFECTIVE_PLAN: false,
    },
    notes: [
      'Confirm writes PlanVersion + Ledger + itinerary rows',
      'Effective plan pointer stays unchanged',
      'Requires RFC001_ITINERARY_MATERIALIZE=1 at runtime',
    ],
  },
  {
    phase: 'PHASE_2_EFFECTIVE_ACTIVATE',
    label: 'Staging Phase 2 — activate effective plan pointer',
    requiredFlags: {
      EXECUTION_RISK_CONFIRM_WRITE_ENABLED: true,
      EXECUTION_RISK_RFC001_WRITE_ADAPTER: true,
      EXECUTION_RISK_ITINERARY_MATERIALIZE: true,
      EXECUTION_RISK_APPLY_EFFECTIVE_PLAN: true,
    },
    notes: [
      'Phase 1 plus setEffective after confirm',
      'Enable EXECUTION_RISK_POST_CONFIRM_REFRESH=1 for snapshot after confirm',
      'Post-confirm risk re-validation via trip.metadata.executionRiskActiveSnapshot',
    ],
  },
  {
    phase: 'PHASE_3_ALLOWLISTED_PRODUCTION',
    label: 'Staging Phase 3 — allowlisted production canary',
    requiredFlags: {
      EXECUTION_RISK_CONFIRM_WRITE_ENABLED: true,
      EXECUTION_RISK_RFC001_WRITE_ADAPTER: true,
      EXECUTION_RISK_ITINERARY_MATERIALIZE: true,
      EXECUTION_RISK_APPLY_EFFECTIVE_PLAN: true,
    },
    notes: [
      'Requires EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS/USERS/CODES',
      'CanonicalRecommendationApplyPort is the write authority entry',
      'Run post-confirm risk refresh before closing the loop',
    ],
  },
];

function isRfc001ItineraryMaterializeEnabled(): boolean {
  const raw = process.env.RFC001_ITINERARY_MATERIALIZE;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function detectExecutionRiskStagingPhase(): ExecutionRiskStagingPhase {
  if (!isExecutionRiskConfirmWriteEnabled()) return 'OFF';

  const allowlist = readExecutionRiskWriteAllowlist();
  const hasAllowlist =
    allowlist.tripIds.size > 0 ||
    allowlist.userIds.size > 0 ||
    allowlist.riskCodes.size > 0;

  if (
    isExecutionRiskRfc001WriteAdapterEnabled() &&
    isExecutionRiskItineraryMaterializeEnabled() &&
    isExecutionRiskApplyEffectivePlanEnabled() &&
    hasAllowlist
  ) {
    return 'PHASE_3_ALLOWLISTED_PRODUCTION';
  }

  if (
    isExecutionRiskRfc001WriteAdapterEnabled() &&
    isExecutionRiskItineraryMaterializeEnabled() &&
    isExecutionRiskApplyEffectivePlanEnabled()
  ) {
    return 'PHASE_2_EFFECTIVE_ACTIVATE';
  }

  if (
    isExecutionRiskRfc001WriteAdapterEnabled() &&
    isExecutionRiskItineraryMaterializeEnabled() &&
    !isExecutionRiskApplyEffectivePlanEnabled()
  ) {
    return 'PHASE_1_MATERIALIZE_ONLY';
  }

  return 'OFF';
}

export function evaluateExecutionRiskStagingRollout(input?: {
  targetPhase?: ExecutionRiskStagingPhase;
}): {
  currentPhase: ExecutionRiskStagingPhase;
  targetPhase: ExecutionRiskStagingPhase;
  flags: ReturnType<typeof readExecutionRiskFeatureFlags> & {
    RFC001_ITINERARY_MATERIALIZE: boolean;
  };
  allowlistConfigured: boolean;
  phaseReady: boolean;
  blockers: string[];
  warnings: string[];
} {
  const targetPhase = input?.targetPhase ?? detectExecutionRiskStagingPhase();
  const currentPhase = detectExecutionRiskStagingPhase();
  const flags = {
    ...readExecutionRiskFeatureFlags(),
    RFC001_ITINERARY_MATERIALIZE: isRfc001ItineraryMaterializeEnabled(),
  };
  const allowlist = readExecutionRiskWriteAllowlist();
  const allowlistConfigured =
    allowlist.tripIds.size > 0 ||
    allowlist.userIds.size > 0 ||
    allowlist.riskCodes.size > 0;

  const spec = EXECUTION_RISK_STAGING_PHASES.find((p) => p.phase === targetPhase)!;
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const [key, expected] of Object.entries(spec.requiredFlags)) {
    const actual = flags[key as keyof typeof flags];
    if (actual !== expected) {
      blockers.push(`${key} expected ${expected} but is ${actual}`);
    }
  }

  if (
    (targetPhase === 'PHASE_1_MATERIALIZE_ONLY' ||
      targetPhase === 'PHASE_2_EFFECTIVE_ACTIVATE' ||
      targetPhase === 'PHASE_3_ALLOWLISTED_PRODUCTION') &&
    !flags.RFC001_ITINERARY_MATERIALIZE
  ) {
    blockers.push('RFC001_ITINERARY_MATERIALIZE must be enabled for itinerary DB writes');
  }

  if (targetPhase === 'PHASE_3_ALLOWLISTED_PRODUCTION' && !allowlistConfigured) {
    blockers.push('Phase 3 requires EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS/USERS/CODES');
  }

  if (
    targetPhase === 'PHASE_2_EFFECTIVE_ACTIVATE' ||
    targetPhase === 'PHASE_3_ALLOWLISTED_PRODUCTION'
  ) {
    warnings.push('After confirm, run ActiveRisk refresh to validate post-apply risk state');
  }

  const phaseOrder: ExecutionRiskStagingPhase[] = [
    'OFF',
    'PHASE_1_MATERIALIZE_ONLY',
    'PHASE_2_EFFECTIVE_ACTIVATE',
    'PHASE_3_ALLOWLISTED_PRODUCTION',
  ];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  const targetIdx = phaseOrder.indexOf(targetPhase);
  if (targetIdx > currentIdx + 1) {
    warnings.push(
      `Target phase ${targetPhase} skips intermediate phase; advance one step at a time`,
    );
  }

  return {
    currentPhase,
    targetPhase,
    flags,
    allowlistConfigured,
    phaseReady: blockers.length === 0,
    blockers,
    warnings,
  };
}
