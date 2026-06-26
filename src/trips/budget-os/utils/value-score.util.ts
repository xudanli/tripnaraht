import type { SpendingPersona } from '../types/trip-budget-os.types';
import type {
  CategoryValueSummary,
  TripValueSummary,
  ValueFeedbackRow,
} from '../types/value-feedback.types';

/** Cold-start category P50 benchmarks (CNY) — PRD §4.4.3 / A5 */
export const CATEGORY_BENCHMARK_P50: Record<string, number> = {
  accommodation: 800,
  transportation: 1500,
  experience: 500,
  activities: 500,
  food: 200,
  other: 100,
};

export function normalizeCategoryKey(category: string): string {
  const key = category.toLowerCase();
  if (key === 'activities') return 'experience';
  if (key === 'accommodation' || key === 'hotel') return 'accommodation';
  if (key === 'transportation' || key === 'transit') return 'transportation';
  if (key === 'food' || key === 'meal') return 'food';
  return key;
}

export function satisfactionToUnit(score: number): number {
  const clamped = Math.min(5, Math.max(1, Math.round(score)));
  return clamped / 5;
}

export function amountNormalized(amount: number, category: string): number {
  const key = normalizeCategoryKey(category);
  const benchmark = CATEGORY_BENCHMARK_P50[key] ?? CATEGORY_BENCHMARK_P50.other;
  return amount / benchmark;
}

export function computeItemValueScore(satisfaction: number, amount: number, category: string): number {
  const sat = satisfactionToUnit(satisfaction);
  const norm = amountNormalized(amount, category);
  if (norm <= 0) return sat;
  return Math.min(1, Math.max(0, sat / norm));
}

export function buildTripValueSummary(
  feedbacks: ValueFeedbackRow[],
): TripValueSummary {
  const byCategory: Record<string, { satSum: number; amountSum: number; normSum: number; count: number }> = {};

  for (const fb of feedbacks) {
    const key = normalizeCategoryKey(fb.category);
    if (!byCategory[key]) {
      byCategory[key] = { satSum: 0, amountSum: 0, normSum: 0, count: 0 };
    }
    const bucket = byCategory[key];
    bucket.satSum += satisfactionToUnit(fb.satisfaction);
    bucket.amountSum += fb.amount;
    bucket.normSum += amountNormalized(fb.amount, fb.category);
    bucket.count += 1;
  }

  const result: Record<string, CategoryValueSummary> = {};
  let weightedScore = 0;
  let totalCount = 0;

  for (const [category, bucket] of Object.entries(byCategory)) {
    const avgSatisfaction = bucket.satSum / bucket.count;
    const avgAmount = bucket.amountSum / bucket.count;
    const avgNorm = bucket.normSum / bucket.count;
    const valueScore =
      avgNorm > 0
        ? Math.min(1, Math.max(0, avgSatisfaction / avgNorm))
        : avgSatisfaction;

    result[category] = {
      avgSatisfaction: round3(avgSatisfaction),
      avgAmount: round2(avgAmount),
      valueScore: round3(valueScore),
      feedbackCount: bucket.count,
    };

    weightedScore += valueScore * bucket.count;
    totalCount += bucket.count;
  }

  if (result.experience && !result.activities) {
    result.activities = { ...result.experience };
  }

  return {
    byCategory: result,
    overallValueScore: totalCount > 0 ? round3(weightedScore / totalCount) : 0,
  };
}

export function deriveMoneyDnaFromFeedbacks(
  userId: string,
  feedbacks: ValueFeedbackRow[],
  tripIds: string[],
): {
  profile: Omit<import('../types/value-feedback.types').MoneyDnaProfile, 'userId' | 'lastUpdatedAt'> & {
    lastUpdatedAt: string;
  };
} {
  const summary = buildTripValueSummary(feedbacks);

  const getScore = (key: string) => summary.byCategory[key]?.valueScore ?? 0.5;

  const experienceSensitivity = getScore('experience');
  const accommodationSensitivity = getScore('accommodation');
  const efficiencySensitivity = getScore('transportation');

  let avgNorm = 0;
  let normCount = 0;
  for (const fb of feedbacks) {
    avgNorm += amountNormalized(fb.amount, fb.category);
    normCount += 1;
  }
  const meanNorm = normCount > 0 ? avgNorm / normCount : 1;
  const frugalityIndex = Math.min(1, Math.max(0, 1 - (meanNorm - 0.5) * 0.5));

  const dominantPersona = inferDominantPersonaFromSensitivities({
    experience: experienceSensitivity,
    accommodation: accommodationSensitivity,
    transportation: efficiencySensitivity,
    frugality: frugalityIndex,
  });

  const tripCount = tripIds.length;
  const confidence = Math.min(1, tripCount >= 3 ? 0.5 + tripCount * 0.1 : tripCount * 0.15);

  return {
    profile: {
      experienceSensitivity: round3(experienceSensitivity),
      accommodationSensitivity: round3(accommodationSensitivity),
      efficiencySensitivity: round3(efficiencySensitivity),
      frugalityIndex: round3(frugalityIndex),
      dominantPersona,
      tripCount,
      confidence: round3(confidence),
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

function inferDominantPersonaFromSensitivities(s: {
  experience: number;
  accommodation: number;
  transportation: number;
  frugality: number;
}): SpendingPersona {
  if (s.frugality >= 0.7 && s.experience < 0.45 && s.accommodation < 0.45) {
    return 'frugal';
  }
  if (s.experience >= s.accommodation && s.experience >= s.transportation && s.experience >= 0.55) {
    return 'experience';
  }
  if (s.accommodation >= s.experience && s.accommodation >= s.transportation && s.accommodation >= 0.55) {
    return 'quality';
  }
  if (s.transportation >= 0.55 && s.experience < 0.5) {
    return 'efficiency';
  }
  return 'balanced';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
