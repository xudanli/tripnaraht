/** 四维 Soft Weight（与 companion-matching.engine breakdown 对齐） */
export interface SoftMatchWeights {
  ei: number;
  tf: number;
  energy: number;
  ambiguity: number;
}

export const DEFAULT_SOFT_MATCH_WEIGHTS: SoftMatchWeights = {
  ei: 0.25,
  tf: 0.3,
  energy: 0.25,
  ambiguity: 0.2,
};

export type SoftWeightDimension = keyof SoftMatchWeights;

export interface SoftWeightAdjustments extends SoftMatchWeights {}

export interface WeightIterationSample {
  q1Overall: number;
  q2PaceSync: number;
  q3Communication: number;
  q4Spending: number;
  q5WouldAgain: number;
  reviewerPersona: PersonaTraits;
  revieweePersona: PersonaTraits;
}

export interface PersonaTraits {
  mbtiType: string;
  dimensionPercents: {
    E: number;
    I: number;
    T: number;
    F: number;
    J: number;
    P: number;
  };
  rawScores: {
    financial_flexibility: number;
    energy_capacity: number;
    ambiguity_tolerance: number;
  };
}

export interface WeightIterationResult {
  weightBefore: SoftMatchWeights;
  weightAfter: SoftMatchWeights;
  adjustments: SoftWeightAdjustments;
  positiveSamples: number;
  negativeSamples: number;
  skippedReason?: string;
}
