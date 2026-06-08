import type {
  SoftMatchWeights,
  SoftWeightAdjustments,
  WeightIterationResult,
  WeightIterationSample,
} from '../types/match-learning.types';
import { DEFAULT_SOFT_MATCH_WEIGHTS } from '../types/match-learning.types';

const POSITIVE_BOOST = 0.05;
const NEGATIVE_PENALTY_BOOST = 0.15;
const MIN_DIM_WEIGHT = 0.08;
const MAX_DIM_WEIGHT = 0.45;

function emptyAdjustments(): SoftWeightAdjustments {
  return { ei: 0, tf: 0, energy: 0, ambiguity: 0 };
}

function normalizeWeights(raw: SoftMatchWeights): SoftMatchWeights {
  const clamped = {
    ei: Math.min(MAX_DIM_WEIGHT, Math.max(MIN_DIM_WEIGHT, raw.ei)),
    tf: Math.min(MAX_DIM_WEIGHT, Math.max(MIN_DIM_WEIGHT, raw.tf)),
    energy: Math.min(MAX_DIM_WEIGHT, Math.max(MIN_DIM_WEIGHT, raw.energy)),
    ambiguity: Math.min(MAX_DIM_WEIGHT, Math.max(MIN_DIM_WEIGHT, raw.ambiguity)),
  };
  const sum = clamped.ei + clamped.tf + clamped.energy + clamped.ambiguity;
  return {
    ei: Math.round((clamped.ei / sum) * 10000) / 10000,
    tf: Math.round((clamped.tf / sum) * 10000) / 10000,
    energy: Math.round((clamped.energy / sum) * 10000) / 10000,
    ambiguity: Math.round((clamped.ambiguity / sum) * 10000) / 10000,
  };
}

function isPositiveSample(sample: WeightIterationSample): boolean {
  return sample.q5WouldAgain >= 4 && sample.q1Overall >= 4;
}

function isNegativeSample(sample: WeightIterationSample): boolean {
  return sample.q1Overall <= 2 && sample.q3Communication <= 2;
}

/** PRD 5.3 — 从 Reputation 互评样本逆向微调 Soft Weights */
export function iterateSoftWeightsFromSamples(
  current: SoftMatchWeights,
  samples: WeightIterationSample[],
): WeightIterationResult {
  if (samples.length === 0) {
    return {
      weightBefore: { ...current },
      weightAfter: { ...current },
      adjustments: emptyAdjustments(),
      positiveSamples: 0,
      negativeSamples: 0,
      skippedReason: 'no_samples',
    };
  }

  const adjustments = emptyAdjustments();
  let positiveSamples = 0;
  let negativeSamples = 0;

  for (const sample of samples) {
    if (isPositiveSample(sample)) {
      positiveSamples += 1;
      if (sample.q5WouldAgain >= 4) adjustments.ei += POSITIVE_BOOST;
      if (sample.q2PaceSync >= 4) adjustments.energy += POSITIVE_BOOST;
      if (sample.q3Communication >= 4) adjustments.tf += POSITIVE_BOOST;
      if (sample.q4Spending >= 4) adjustments.ambiguity += POSITIVE_BOOST;
      continue;
    }

    if (!isNegativeSample(sample)) continue;

    negativeSamples += 1;
    const { reviewerPersona: a, revieweePersona: b } = sample;

    const jGap = Math.abs(a.dimensionPercents.J - b.dimensionPercents.J);
    const pGap = Math.abs(a.dimensionPercents.P - b.dimensionPercents.P);
    if (jGap >= 35 || pGap >= 35) {
      adjustments.energy += NEGATIVE_PENALTY_BOOST;
    }

    const eGap = Math.abs(a.dimensionPercents.E - b.dimensionPercents.E);
    if (eGap >= 40) {
      adjustments.ei += NEGATIVE_PENALTY_BOOST;
    }

    const finGap = Math.abs(a.rawScores.financial_flexibility - b.rawScores.financial_flexibility);
    if (finGap >= 3) {
      adjustments.ambiguity += NEGATIVE_PENALTY_BOOST;
    }

    const tGap = Math.abs(a.dimensionPercents.T - b.dimensionPercents.T);
    if (tGap >= 40) {
      adjustments.tf += NEGATIVE_PENALTY_BOOST;
    }
  }

  if (positiveSamples === 0 && negativeSamples === 0) {
    return {
      weightBefore: { ...current },
      weightAfter: { ...current },
      adjustments,
      positiveSamples: 0,
      negativeSamples: 0,
      skippedReason: 'no_actionable_samples',
    };
  }

  const weightAfter = normalizeWeights({
    ei: current.ei + adjustments.ei,
    tf: current.tf + adjustments.tf,
    energy: current.energy + adjustments.energy,
    ambiguity: current.ambiguity + adjustments.ambiguity,
  });

  return {
    weightBefore: { ...current },
    weightAfter,
    adjustments,
    positiveSamples,
    negativeSamples,
  };
}

export function parseSoftWeights(raw: unknown): SoftMatchWeights {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SOFT_MATCH_WEIGHTS };
  }
  const obj = raw as Record<string, unknown>;
  const candidate = {
    ei: Number(obj.ei),
    tf: Number(obj.tf),
    energy: Number(obj.energy),
    ambiguity: Number(obj.ambiguity),
  };
  if (Object.values(candidate).some((v) => Number.isNaN(v) || v <= 0)) {
    return { ...DEFAULT_SOFT_MATCH_WEIGHTS };
  }
  return normalizeWeights(candidate);
}
