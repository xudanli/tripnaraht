/**
 * P15-B — Self-evolving constraint laws (bounded mutation; no online ML).
 */

export type ConstraintGeneType = 'ROAD_RULE' | 'TEMPORAL_RULE' | 'WEATHER_RULE' | 'BEHAVIOR_RULE';

export interface ConstraintGene {
  id: string;
  type: ConstraintGeneType;
  /** Declarative tag — evaluated by downstream compilers, not `eval`. */
  expression: string;
  /** Strength in [0,1]. */
  weight: number;
  /** Step size for deterministic mutation (not stochastic runtime learning). */
  mutationRate: number;
}

export interface ConstraintPopulation {
  generation: number;
  genes: ConstraintGene[];
  /** Last aggregate fitness [0,1]. */
  fitness: number;
}

export interface ConstraintFitnessBreakdown {
  feasibilityScore: number;
  userSatisfaction: number;
  executionStability: number;
}
