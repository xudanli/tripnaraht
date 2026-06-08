import { createEmptyRawScores, computeDimensionPercents } from '../../odyssey-intake/engine/intake-scoring.engine';
import { buildApplicationMatchInsights } from './application-insights.engine';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';

function makeSnapshot(overrides: Partial<ReturnType<typeof createEmptyRawScores>> = {}): CaptainPersonaSnapshot {
  const rawScores = { ...createEmptyRawScores(), ...overrides };
  const dimensionPercents = computeDimensionPercents(rawScores);
  return {
    mbtiType: 'INTJ',
    cardTitle: '规划型探索者',
    interactionMode: 'deep_learning',
    interactionModeLabel: '深度共学型',
    quadrant: 'NT',
    rawScores,
    dimensionPercents,
  };
}

describe('application-insights.engine', () => {
  it('generates highlights and warnings from dimension fit', () => {
    const captain = makeSnapshot({
      financial_flexibility: 0,
      ambiguity_tolerance: 2,
      aesthetic_preference: 2,
      mbti_j_score: 8,
      mbti_p_score: 0,
    });
    captain.dimensionPercents = computeDimensionPercents(captain.rawScores);

    const applicant = makeSnapshot({
      financial_flexibility: 0,
      ambiguity_tolerance: 2,
      aesthetic_preference: -2,
      mbti_j_score: 0,
      mbti_p_score: 8,
    });
    applicant.dimensionPercents = computeDimensionPercents(applicant.rawScores);
    applicant.mbtiType = 'INFP';

    const insights = buildApplicationMatchInsights(captain, applicant);

    expect(insights.compatibilityPercent).toBeGreaterThan(0);
    expect(insights.highlights.length).toBeGreaterThan(0);
    expect(insights.warnings.length).toBeGreaterThan(0);
  });
});
