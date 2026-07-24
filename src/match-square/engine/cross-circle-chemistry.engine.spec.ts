import {
  CROSS_INDUSTRY_HIGH_ENERGY_BONUS,
  computeIndustryAntiClustering,
  detectCrossCircleChemistry,
  resolveCrossCirclePuzzleSlot,
  SAME_INDUSTRY_HOMOGENEITY_PENALTY,
} from './cross-circle-chemistry.engine';
import { computeStructuralMatchScore } from './structural-match.engine';
import { createEmptyRawScores } from '../../odyssey-intake/engine/intake-scoring.engine';

const HIGH_P_PERCENTS = { E: 72, I: 28, N: 65, S: 35, T: 55, F: 45, J: 35, P: 72 };

describe('cross-circle-chemistry.engine', () => {
  const highP = HIGH_P_PERCENTS;

  it('detects wall_break_flywheel for INTJ tech captain + ENFP creative member', () => {
    const match = detectCrossCircleChemistry({
      captainMbti: 'INTJ',
      memberMbti: 'ENFP',
      captainIndustry: 'tech',
      memberIndustry: 'creative',
      memberHighEnergy: true,
    });
    expect(match?.script.id).toBe('wall_break_flywheel');
    expect(match?.bonusPoints).toBe(18);
  });

  it('applies same-industry homogeneity penalty for two tech profiles', () => {
    const result = computeIndustryAntiClustering({
      captainIndustry: 'tech',
      memberIndustry: 'tech',
      memberHighEnergy: true,
      chemistryMatched: false,
    });
    expect(result.deltaPoints).toBe(SAME_INDUSTRY_HOMOGENEITY_PENALTY);
    expect(result.sameIndustryPenalty).toBe(true);
  });

  it('boosts cross-industry high-energy when no script match', () => {
    const result = computeIndustryAntiClustering({
      captainIndustry: 'tech',
      memberIndustry: 'manufacturing',
      memberHighEnergy: true,
      chemistryMatched: false,
    });
    expect(result.deltaPoints).toBe(CROSS_INDUSTRY_HIGH_ENERGY_BONUS);
    expect(result.crossIndustryBoost).toBe(true);
  });

  it('does not double-count cross-industry bonus when chemistry script hits', () => {
    const result = computeIndustryAntiClustering({
      captainIndustry: 'tech',
      memberIndustry: 'creative',
      memberHighEnergy: true,
      chemistryMatched: true,
    });
    expect(result.deltaPoints).toBe(0);
  });

  it('resolves cross-circle puzzle slot for INTJ tech captain', () => {
    const slot = resolveCrossCirclePuzzleSlot({ captainMbti: 'INTJ', captainIndustry: 'tech' });
    expect(slot?.id).toBe('wall_break_flywheel');
    expect(slot?.puzzleLabel).toContain('破壁飞轮');
  });
});

describe('structural match with cross-circle chemistry', () => {
  it('scores higher for INTJ tech + ENFP creative than INTJ tech + INTJ tech', () => {
    const leaderScores = {
      ...createEmptyRawScores(),
      control_desire: 2,
      quality_baseline: 2,
    };
    const artistScores = {
      ...createEmptyRawScores(),
      risk_appetite: 2,
      ambiguity_tolerance: 2,
    };

    const crossResult = computeStructuralMatchScore({
      leader: {
        mbtiType: 'INTJ',
        rawScores: leaderScores,
        dimensionPercents: { E: 28, I: 72, N: 72, S: 28, T: 72, F: 28, J: 72, P: 28 },
        credentials: {
          education: {
            verified: true,
            degreeLevel: 'master',
            tierTag: '985_211',
            displayTag: 'x',
            verificationChannel: 'xuexin_online_code',
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
          profession: {
            verified: true,
            industryTag: 'tech',
            companyTierTag: 'tier1_tech',
            roleLevelTag: 'product_director',
            verificationChannel: 'work_email',
            displayTags: ['x'],
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
        },
      },
      member: {
        mbtiType: 'ENFP',
        rawScores: artistScores,
        dimensionPercents: HIGH_P_PERCENTS,
        credentials: {
          education: {
            verified: true,
            degreeLevel: 'master',
            tierTag: '985_211',
            displayTag: 'x',
            verificationChannel: 'xuexin_online_code',
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
          profession: {
            verified: true,
            industryTag: 'creative',
            companyTierTag: 'general',
            roleLevelTag: 'manager',
            verificationChannel: 'badge_ocr',
            displayTags: ['独立策展人(已认证)'],
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
        },
      },
      teamworkStyle: 'full_managed',
      skipTripGate: true,
    });

    const homogenousResult = computeStructuralMatchScore({
      leader: {
        mbtiType: 'INTJ',
        rawScores: leaderScores,
        dimensionPercents: { E: 28, I: 72, N: 72, S: 28, T: 72, F: 28, J: 72, P: 28 },
        credentials: {
          profession: {
            verified: true,
            industryTag: 'tech',
            companyTierTag: 'tier1_tech',
            roleLevelTag: 'product_director',
            verificationChannel: 'work_email',
            displayTags: ['x'],
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
        },
      },
      member: {
        mbtiType: 'INTJ',
        rawScores: leaderScores,
        dimensionPercents: { E: 28, I: 72, N: 72, S: 28, T: 72, F: 28, J: 72, P: 28 },
        credentials: {
          education: {
            verified: true,
            degreeLevel: 'master',
            tierTag: '985_211',
            displayTag: 'x',
            verificationChannel: 'xuexin_online_code',
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
          profession: {
            verified: true,
            industryTag: 'tech',
            companyTierTag: 'tier1_tech',
            roleLevelTag: 'manager',
            verificationChannel: 'work_email',
            displayTags: ['x'],
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
        },
      },
      skipTripGate: true,
    });

    expect(crossResult.breakdown?.chemistryScriptId).toBe('wall_break_flywheel');
    expect(crossResult.compatibilityPercent).toBeGreaterThan(homogenousResult.compatibilityPercent ?? 0);
    expect(crossResult.insightDrawer?.lines.some((l) => l.label.includes('破壁飞轮'))).toBe(true);
  });
});
