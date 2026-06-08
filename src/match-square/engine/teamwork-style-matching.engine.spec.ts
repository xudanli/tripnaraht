import {
  computeTeamworkStyleMatch,
  failsTeamworkStyleHardGate,
} from './teamwork-style-matching.engine';
import { createEmptyRawScores, computeDimensionPercents } from '../../odyssey-intake/engine/intake-scoring.engine';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';

function snapshot(overrides: Partial<CaptainPersonaSnapshot> = {}): CaptainPersonaSnapshot {
  const rawScores = createEmptyRawScores();
  return {
    mbtiType: 'ENFP',
    cardTitle: 'test',
    interactionMode: 'easy_companion',
    interactionModeLabel: '轻松陪伴型',
    quadrant: 'NF',
    rawScores,
    dimensionPercents: computeDimensionPercents(rawScores),
    ...overrides,
  };
}

describe('teamwork style matching', () => {
  it('hard gates casual_play vs strong J applicant', () => {
    const applicant = snapshot({
      dimensionPercents: computeDimensionPercents({
        ...createEmptyRawScores(),
        mbti_j_score: 10,
        mbti_p_score: 0,
      }),
    });
    expect(failsTeamworkStyleHardGate('casual_play', applicant)).toBe(true);
  });

  it('boosts full_managed + passive follower', () => {
    const captain = snapshot();
    const applicant = snapshot({
      dimensionPercents: computeDimensionPercents({
        ...createEmptyRawScores(),
        mbti_j_score: 0,
        mbti_p_score: 10,
      }),
    });
    const result = computeTeamworkStyleMatch('full_managed', captain, applicant);
    expect(result.hardBlocked).toBe(false);
    expect(result.deltaPercent).toBe(15);
  });

  it('penalizes full_managed + co-creator planner', () => {
    const captain = snapshot();
    const applicant = snapshot({
      rawScores: { ...createEmptyRawScores(), aesthetic_preference: 2 },
      dimensionPercents: computeDimensionPercents({
        ...createEmptyRawScores(),
        mbti_j_score: 10,
        aesthetic_preference: 2,
      }),
    });
    const result = computeTeamworkStyleMatch('full_managed', captain, applicant);
    expect(result.deltaPercent).toBe(-20);
  });
});
