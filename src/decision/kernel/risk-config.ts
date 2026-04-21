export type ThresholdPenaltyRule = Array<{ threshold: number; penalty: number }>;

/**
 * Table-driven risk cost rules (MILP-friendly).
 * Keep this file as the single place to tune weights without touching the MILP builder.
 */
export const F_ROAD_RISK_RULES = {
  /**
   * Water crossing depth (cm) -> additive penalty (stepwise).
   * Interpret penalty as "risk cost" (not probability); higher = worse.
   */
  water_crossing_cm: [
    { threshold: 0, penalty: 0.0 },
    { threshold: 20, penalty: 0.5 },
    { threshold: 50, penalty: 2.0 },
    { threshold: 80, penalty: 8.0 },
  ] satisfies ThresholdPenaltyRule,

  /**
   * Steepness (pct) -> linear penalty beyond a free allowance.
   * Example: above 10%, each +5% adds +0.2.
   */
  steepness: {
    free_pct: 10,
    step_pct: 5,
    penalty_per_step: 0.2,
  },

  /** Surface type -> additive penalty. */
  surface: {
    asphalt: 0.0,
    gravel: 0.3,
    loose_rock: 1.5,
    mud: 2.5,
  } as const,
} as const;

