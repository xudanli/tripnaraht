import { createEmptyRawScores, computeDimensionPercents } from './intake-scoring.engine';
import {
  passesHardGates,
  failsFinancialBandwidthGate,
  failsPlanningPolarityGate,
  rankCompanionMatches,
  type MatchableProfile,
} from './companion-matching.engine';

function makeProfile(
  userId: string,
  overrides: Partial<ReturnType<typeof createEmptyRawScores>> = {},
): MatchableProfile {
  const rawScores = { ...createEmptyRawScores(), ...overrides };
  return {
    userId,
    mbtiType: 'ENFP',
    cardTitle: 'test',
    rawScores,
    dimensionPercents: computeDimensionPercents(rawScores),
  };
}

describe('companion-matching.engine', () => {
  it('hard-gates financial bandwidth mismatch (-2 vs +2)', () => {
    const seeker = makeProfile('a', { financial_flexibility: -2 });
    const candidate = makeProfile('b', { financial_flexibility: 2 });
    expect(failsFinancialBandwidthGate({ seeker, candidate })).toBe(true);
    expect(passesHardGates({ seeker, candidate })).toBe(false);
  });

  it('hard-gates strong J vs strong P', () => {
    const seeker = makeProfile('a', { mbti_j_score: 10, mbti_p_score: 0 });
    const candidate = makeProfile('b', { mbti_j_score: 0, mbti_p_score: 10 });
    seeker.dimensionPercents = computeDimensionPercents(seeker.rawScores);
    candidate.dimensionPercents = computeDimensionPercents(candidate.rawScores);
    expect(failsPlanningPolarityGate({ seeker, candidate })).toBe(true);
  });

  it('ranks structurally stronger candidates higher', () => {
    const seeker = makeProfile('seeker', {
      financial_flexibility: 0,
      mbti_e_score: 3,
      mbti_i_score: 1,
      energy_capacity: 2,
      ambiguity_tolerance: 1,
      control_desire: 2,
      quality_baseline: 2,
    });
    seeker.dimensionPercents = computeDimensionPercents(seeker.rawScores);

    const good = makeProfile('good', {
      financial_flexibility: 1,
      mbti_e_score: 1,
      mbti_i_score: 3,
      energy_capacity: 2,
      ambiguity_tolerance: 1,
      compromise_index: 2,
      safety_first: 2,
    });
    good.dimensionPercents = computeDimensionPercents(good.rawScores);

    const bad = makeProfile('bad', {
      financial_flexibility: 2,
      control_desire: 2,
      quality_baseline: 2,
      financial_elasticity: 2,
      independence: 2,
    });
    bad.dimensionPercents = computeDimensionPercents(bad.rawScores);

    const ranked = rankCompanionMatches(seeker, [bad, good], 10);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0].userId).toBe('good');
    expect(ranked[0].compatibilityScore).toBeGreaterThan(0.5);
  });

  it('completes matching within 300ms for 500 candidates', () => {
    const seeker = makeProfile('seeker', { mbti_e_score: 2, mbti_i_score: 2 });
    seeker.dimensionPercents = computeDimensionPercents(seeker.rawScores);

    const pool: MatchableProfile[] = Array.from({ length: 500 }, (_, i) => {
      const p = makeProfile(`u${i}`, {
        financial_flexibility: i % 3 - 1,
        mbti_e_score: i % 5,
        mbti_i_score: (i + 2) % 5,
      });
      p.dimensionPercents = computeDimensionPercents(p.rawScores);
      return p;
    });

    const start = Date.now();
    rankCompanionMatches(seeker, pool, 20);
    expect(Date.now() - start).toBeLessThan(300);
  });
});
