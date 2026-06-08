import {
  computeTeamPuzzleDeficits,
  formatSuggestedRoleLabel,
  scoreViewerAgainstDeficit,
} from './team-puzzle-deficit.engine';
import { createEmptyRawScores, computeDimensionPercents } from '../../odyssey-intake/engine/intake-scoring.engine';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';

describe('team-puzzle-deficit.engine', () => {
  const isfjCaptain: CaptainPersonaSnapshot = {
    mbtiType: 'ISFJ',
    cardTitle: '秩序维护的质感旅行者',
    interactionMode: 'steady_companion',
    interactionModeLabel: '稳定陪伴型',
    quadrant: 'SJ',
    rawScores: {
      ...createEmptyRawScores(),
      ambiguity_tolerance: -1,
      stress_anxiety_index: 1,
      mbti_i_score: 8,
      mbti_j_score: 6,
    },
    dimensionPercents: {
      E: 30,
      I: 70,
      N: 35,
      S: 65,
      T: 45,
      F: 55,
      J: 68,
      P: 32,
    },
  };

  it('generates E/I balance slot for introvert captain', () => {
    const deficits = computeTeamPuzzleDeficits(
      isfjCaptain,
      { travelMode: 'self_drive', vehicleInfo: '宝马3系', preferenceNotes: null, captainMessage: null },
      3,
    );
    expect(deficits[0].deficitDimension).toBe('energy_balance');
    expect(deficits[0].shortLabel).toContain('社交气氛组');
    expect(formatSuggestedRoleLabel(deficits[0].shortLabel)).toContain('建议补位');
  });

  it('scores ENFP highly for energy balance slot', () => {
    const deficits = computeTeamPuzzleDeficits(
      isfjCaptain,
      { travelMode: null, vehicleInfo: null, preferenceNotes: null, captainMessage: null },
      1,
    );
    const scores = computeDimensionPercents({
      ...createEmptyRawScores(),
      mbti_e_score: 8,
      social_drive: 2,
    });
    const enfpScore = scoreViewerAgainstDeficit(
      {
        userId: 'v1',
        mbtiType: 'ENFP',
        cardTitle: '满血复活的社交气氛组',
        rawScores: createEmptyRawScores(),
        dimensionPercents: { ...scores, E: 72, I: 28 },
      },
      deficits[0],
      isfjCaptain,
    );
    expect(enfpScore).toBeGreaterThanOrEqual(72);
  });

  it('generates full_managed executor slot for INTJ control leader captain', () => {
    const intjCaptain: CaptainPersonaSnapshot = {
      ...isfjCaptain,
      mbtiType: 'INTJ',
      rawScores: {
        ...createEmptyRawScores(),
        control_desire: 2,
        quality_baseline: 2,
        mbti_i_score: 6,
        mbti_j_score: 8,
      },
      dimensionPercents: {
        E: 28,
        I: 72,
        N: 72,
        S: 28,
        T: 72,
        F: 28,
        J: 72,
        P: 28,
      },
    };

    const deficits = computeTeamPuzzleDeficits(
      intjCaptain,
      {
        travelMode: 'self_drive',
        vehicleInfo: null,
        preferenceNotes: null,
        captainMessage: null,
        teamworkStyle: 'full_managed',
      },
      2,
    );

    expect(deficits[0].deficitDimension).toBe('collaboration_fit');
    expect(deficits[0].shortLabel).toContain('全托管');
    expect(deficits[0].minEducationTier).toBe('bachelor_plus');
  });

  it('prioritizes cross-circle chemistry slot for INTJ tech captain', () => {
    const intjCaptain: CaptainPersonaSnapshot = {
      ...isfjCaptain,
      mbtiType: 'INTJ',
      rawScores: { ...createEmptyRawScores(), control_desire: 2 },
    };

    const deficits = computeTeamPuzzleDeficits(
      intjCaptain,
      {
        travelMode: null,
        vehicleInfo: null,
        preferenceNotes: null,
        captainMessage: null,
        captainSocial: { professionIndustry: 'tech', educationDegree: 'master' },
        teamworkStyle: 'full_managed',
      },
      2,
    );

    expect(deficits[0].deficitDimension).toBe('cross_circle_chemistry');
    expect(deficits[0].shortLabel).toContain('破壁飞轮');
    expect(deficits[0].targetMbtiTypes).toContain('ENFP');
  });
});
