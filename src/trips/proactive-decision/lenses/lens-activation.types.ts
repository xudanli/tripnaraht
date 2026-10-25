/**
 * RFC-PD-001 §6 — Decision Lens Activation Policy (V1 freeze).
 */

export const LENS_ACTIVATION_SCHEMA_ID = 'nara.lens_activation_policy@v1' as const;

export type ProactiveLensId = 'ABU' | 'DR_DRE' | 'NEPTUNE';

/** Abu required triggers */
export type AbuActivationTrigger =
  | 'safety_related'
  | 'feasibility_uncertain'
  | 'road_constraint'
  | 'weather_risk'
  | 'legality_constraint';

/** Dr.Dre required triggers */
export type DrDreActivationTrigger =
  | 'schedule_tradeoff'
  | 'fatigue'
  | 'experience_loss'
  | 'user_preference_conflict';

/** Neptune required triggers */
export type NeptuneActivationTrigger =
  | 'original_plan_failed'
  | 'utility_drop'
  | 'user_requested_change'
  | 'repair_required';

export type LensActivationTrigger =
  | AbuActivationTrigger
  | DrDreActivationTrigger
  | NeptuneActivationTrigger;

export type LensActivationSignalsV1 = {
  /** Present triggers observed for this Decision Case */
  triggers: LensActivationTrigger[];
  /**
   * Need Alternative? When true, Neptune activates even without explicit repair trigger.
   * Weather default: Abu+Dre always; Neptune only if this is true.
   */
  needAlternative: boolean;
  /** Country Pack: mustAdjust forces Abu → Dre → Neptune */
  mustAdjust?: boolean;
  /** Country Pack: mustRepair forces Neptune + re-eval */
  mustRepair?: boolean;
  /** Hard feasibility already failed (Abu HARD_BLOCK path) */
  hardBlocked?: boolean;
};

export type LensActivationDecisionV1 = {
  schemaId: typeof LENS_ACTIVATION_SCHEMA_ID;
  version: 1;
  activateAbu: boolean;
  activateDrDre: boolean;
  activateNeptune: boolean;
  /** Ordered lenses to run */
  lensOrder: ProactiveLensId[];
  matchedTriggers: LensActivationTrigger[];
  rationaleZh: string[];
  /**
   * After Neptune repair, Abu/Dre must re-evaluate (mustRepair / mustAdjust).
   */
  requirePostRepairRecheck: boolean;
};

export type HardGateVerdict = 'ALLOW' | 'HARD_BLOCK';

export type HardGateInvariantInput = {
  abuVerdict: HardGateVerdict;
  /** Candidate / CGUS recommendation that would proceed despite Abu */
  recommendationOverridesHardBlock?: boolean;
};
