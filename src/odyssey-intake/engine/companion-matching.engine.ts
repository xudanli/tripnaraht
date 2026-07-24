import type {
  CompanionMatchCandidate,
  OdysseyDimensionPercents,
  OdysseyRawScores,
} from '../types/odyssey-intake.types';
import { getActiveSoftMatchWeights } from '../../match-learning/matching-weights.store';
import { DEFAULT_SOFT_MATCH_WEIGHTS, type SoftMatchWeights } from '../../match-learning/types/match-learning.types';
import { parseSoftWeights } from '../../match-learning/engine/soft-weight-iteration.engine';
import { computeStructuralMatchScore } from '../../match-square/engine/structural-match.engine';

export { DEFAULT_SOFT_MATCH_WEIGHTS, type SoftMatchWeights };

export interface MatchableProfile {
  userId: string;
  mbtiType: string;
  cardTitle: string;
  rawScores: OdysseyRawScores;
  dimensionPercents: OdysseyDimensionPercents;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export interface HardGateContext {
  seeker: MatchableProfile;
  candidate: MatchableProfile;
}

export function resolveSoftMatchWeights(override?: SoftMatchWeights): SoftMatchWeights {
  if (override) return parseSoftWeights(override);
  return getActiveSoftMatchWeights();
}

/** Hard Gate：时间与目的地不匹配（legacy；v2 使用 structural 3 天交集） */
export function failsDestinationOrTimeGate(ctx: HardGateContext): boolean {
  const { seeker, candidate } = ctx;
  if (seeker.destination && candidate.destination) {
    if (seeker.destination.toLowerCase() !== candidate.destination.toLowerCase()) {
      return true;
    }
  }
  if (seeker.startDate && seeker.endDate && candidate.startDate && candidate.endDate) {
    if (seeker.endDate < candidate.startDate || candidate.endDate < seeker.startDate) {
      return true;
    }
  }
  return false;
}

export function failsFinancialBandwidthGate(ctx: HardGateContext): boolean {
  const a = ctx.seeker.rawScores.financial_flexibility;
  const b = ctx.candidate.rawScores.financial_flexibility;
  return (a <= -2 && b >= 2) || (b <= -2 && a >= 2);
}

export function failsPlanningPolarityGate(ctx: HardGateContext): boolean {
  const seekerJ = ctx.seeker.dimensionPercents.J;
  const seekerP = ctx.seeker.dimensionPercents.P;
  const candJ = ctx.candidate.dimensionPercents.J;
  const candP = ctx.candidate.dimensionPercents.P;

  return (seekerJ > 85 && candP > 85) || (seekerP > 85 && candJ > 85);
}

export function passesHardGates(ctx: HardGateContext): boolean {
  return (
    !failsDestinationOrTimeGate(ctx) &&
    !failsFinancialBandwidthGate(ctx) &&
    !failsPlanningPolarityGate(ctx)
  );
}

export function computeEiFit(a: OdysseyDimensionPercents, b: OdysseyDimensionPercents): number {
  const aE = a.E / 100;
  const bE = b.E / 100;
  const complement = 1 - Math.abs(aE - bE);
  const bothExtreme = (aE > 0.85 && bE > 0.85) || (aE < 0.15 && bE < 0.15);
  return bothExtreme ? complement * 0.5 : complement;
}

export function computeTfFit(a: OdysseyDimensionPercents, b: OdysseyDimensionPercents): number {
  const aT = a.T / 100;
  const bT = b.T / 100;
  const bothExtremeT = aT > 0.85 && bT > 0.85;
  const bothExtremeF = aT < 0.15 && bT < 0.15;
  if (bothExtremeT || bothExtremeF) return 0.2;
  const moderateGap = Math.abs(aT - bT);
  return moderateGap >= 0.2 && moderateGap <= 0.6 ? 1 : 0.7 - Math.abs(moderateGap - 0.4);
}

export function computeEnergyFit(a: OdysseyRawScores, b: OdysseyRawScores): number {
  const diff = Math.abs(a.energy_capacity - b.energy_capacity);
  return Math.max(0, 1 - diff / 6);
}

export function computeAmbiguityFit(a: OdysseyRawScores, b: OdysseyRawScores): number {
  const diff = Math.abs(a.ambiguity_tolerance - b.ambiguity_tolerance);
  return Math.max(0, 1 - diff / 6);
}

export function computeCompatibilityScore(
  seeker: MatchableProfile,
  candidate: MatchableProfile,
  weights: SoftMatchWeights = resolveSoftMatchWeights(),
): {
  score: number;
  breakdown: CompanionMatchCandidate['dimensionBreakdown'];
} {
  const eiFit = computeEiFit(seeker.dimensionPercents, candidate.dimensionPercents);
  const tfFit = computeTfFit(seeker.dimensionPercents, candidate.dimensionPercents);
  const energyFit = computeEnergyFit(seeker.rawScores, candidate.rawScores);
  const ambiguityFit = computeAmbiguityFit(seeker.rawScores, candidate.rawScores);

  const score =
    weights.ei * eiFit +
    weights.tf * tfFit +
    weights.energy * energyFit +
    weights.ambiguity * ambiguityFit;

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: { eiFit, tfFit, energyFit, ambiguityFit },
  };
}

function toStructuralParticipant(profile: MatchableProfile) {
  return {
    userId: profile.userId,
    mbtiType: profile.mbtiType,
    rawScores: profile.rawScores,
    dimensionPercents: profile.dimensionPercents,
    trip: {
      destination: profile.destination,
      startDate: profile.startDate,
      endDate: profile.endDate,
    },
  };
}

/** v2 Graph+CSP 硬门槛 + 团队结构稳定性评分 */
export function rankCompanionMatches(
  seeker: MatchableProfile,
  candidates: MatchableProfile[],
  limit = 20,
): CompanionMatchCandidate[] {
  const results: CompanionMatchCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.userId === seeker.userId) continue;

    const structural = computeStructuralMatchScore({
      leader: toStructuralParticipant(seeker),
      member: toStructuralParticipant(candidate),
      skipTripGate: !seeker.startDate || !candidate.startDate,
    });

    if (structural.hardBlocked || structural.compatibilityPercent == null) continue;

    const legacyBreakdown = computeCompatibilityScore(seeker, candidate);

    results.push({
      userId: candidate.userId,
      mbtiType: candidate.mbtiType,
      cardTitle: candidate.cardTitle,
      compatibilityScore: structural.compatibilityPercent / 100,
      dimensionBreakdown: legacyBreakdown.breakdown,
    });
  }

  return results.sort((a, b) => b.compatibilityScore - a.compatibilityScore).slice(0, limit);
}
