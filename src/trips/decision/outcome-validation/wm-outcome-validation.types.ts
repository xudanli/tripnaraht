/**
 * World Model Outcome Validation — record schema.
 *
 * Phase after WM-M1. Not a new World representation.
 * Answers: Without bridge Decision=A; With bridge=B; was B better?
 */

export const WM_OUTCOME_VALIDATION_SCHEMA =
  'tripnara.wm_outcome_validation_tick@v1' as const;

export type UserDecisionAction = 'ACCEPT' | 'REJECT' | 'OVERRIDE' | 'UNKNOWN';

export type ExecutionStatus =
  | 'EXECUTED'
  | 'NOT_EXECUTED'
  | 'PARTIAL'
  | 'UNKNOWN';

export type OutcomeSuccess = 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'UNKNOWN';

export type SafetyOutcome =
  | 'AVOIDED_RISK'
  | 'UNNECESSARY_INTERVENTION'
  | 'RISK_MATERIALIZED'
  | 'NEUTRAL'
  | 'UNKNOWN';

/** Compact recommendation fingerprint (not a WorldXXX dump). */
export interface DecisionRecommendationView {
  id: string;
  /** Human-readable summary, e.g. BLOCK_F208 / ALLOW_OPEN / REROUTE */
  summary: string;
  gateBlocks: boolean;
  gateRequiresVerification: boolean;
  cgusFeasible: boolean;
  worldSees?: string;
}

export interface WorldEvidenceSlice {
  sourceVersion?: {
    evidenceId: string;
    observedAt: string;
    source: string;
    authority: string;
    version: string;
  };
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  authority: string;
}

export interface WmOutcomeValidationRecord {
  schemaId: typeof WM_OUTCOME_VALIDATION_SCHEMA;
  recordId: string;
  tripId: string;
  tickId: string;
  subject: 'ROAD' | 'POI' | 'WIND' | 'OTHER';
  subjectId: string;
  recordedAt: string;

  world: WorldEvidenceSlice;

  /** Without bridge → Decision A */
  decisionWithoutBridge: DecisionRecommendationView;
  /** With bridge → Decision B */
  decisionWithBridge: DecisionRecommendationView;
  /** Which recommendation was actually served to the user */
  served: 'WITHOUT_BRIDGE' | 'WITH_BRIDGE' | 'UNKNOWN';

  user: {
    action: UserDecisionAction;
    overrideNote?: string;
  };

  execution: {
    status: ExecutionStatus;
    repairOccurred: boolean;
    repairCodes?: string[];
  };

  outcome: {
    success: OutcomeSuccess;
    notes?: string;
  };

  experience: {
    regret?: boolean;
    satisfaction?: number; // 0–1 or 1–5
  };

  safety: {
    result: SafetyOutcome;
    notes?: string;
  };

  /**
   * Core product question:
   * Did serving B (with bridge) yield a better actual outcome than A would imply?
   */
  verdict: {
    decisionDiffered: boolean;
    /** null = insufficient outcome evidence */
    bWasBetter: boolean | null;
    rationale: string[];
  };
}
