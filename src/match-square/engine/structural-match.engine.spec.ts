import type { CaptainPersonaSnapshot } from '../types/match-square.types';
import {
  computeStructuralMatchScore,
  computeTripOverlapDays,
  failsSocialBandwidthGate,
  computeTeamworkFitPoints,
  computeStressFitPoints,
} from './structural-match.engine';
import { buildUserFeatureVector, mapPremiumStressTraits } from './user-feature-vector.engine';
import { createEmptyRawScores } from '../../odyssey-intake/engine/intake-scoring.engine';

describe('user-feature-vector.engine', () => {
  it('maps premium stress traits to C/A/F scale', () => {
    const scores = {
      ...createEmptyRawScores(),
      control_desire: 2,
      quality_baseline: 2,
      risk_appetite: 2,
      financial_elasticity: 2,
      independence: 2,
    };
    const traits = mapPremiumStressTraits(scores);
    expect(traits.cControl).toBe(10);
    expect(traits.aQualityAmbiguity).toBe(10);
    expect(traits.fFinancialIndependence).toBe(10);
  });

  it('builds social score from verified credentials', () => {
    const vector = buildUserFeatureVector({
      mbtiType: 'INTJ',
      rawScores: { ...createEmptyRawScores(), control_desire: 2 },
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
    });
    expect(vector.socialScore).toBe(5 * 4 * 5);
    expect(vector.cControl).toBe(10);
  });
});

describe('structural-match.engine', () => {
  const premiumLeaderScores = {
    ...createEmptyRawScores(),
    control_desire: 2,
    quality_baseline: 2,
    risk_appetite: 2,
    financial_elasticity: 2,
    independence: 2,
  };

  const passiveMemberScores = {
    ...createEmptyRawScores(),
    collaborative_trait: 0,
    control_desire: 0,
    compromise_index: 2,
    safety_first: 2,
  };

  function persona(
    mbti: string,
    rawScores: ReturnType<typeof createEmptyRawScores>,
  ): CaptainPersonaSnapshot {
    return {
      mbtiType: mbti,
      cardTitle: 'test',
      interactionMode: 'x',
      interactionModeLabel: 'x',
      quadrant: 'NT',
      rawScores,
      dimensionPercents: { E: 28, I: 72, N: 72, S: 28, T: 72, F: 28, J: 72, P: 28 },
    };
  }

  it('blocks when trip overlap < 3 days', () => {
    expect(
      computeTripOverlapDays(
        { startDate: '2026-07-01', endDate: '2026-07-05' },
        { startDate: '2026-07-10', endDate: '2026-07-12' },
      ),
    ).toBe(0);
  });

  it('scores INTJ leader + ISFP follower high for full_managed', () => {
    const result = computeStructuralMatchScore({
      leader: {
        ...persona('INTJ', premiumLeaderScores),
        trip: { destination: 'Iceland', startDate: '2026-07-01', endDate: '2026-07-10' },
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
        },
      },
      member: {
        ...persona('ISFP', passiveMemberScores),
        trip: { destination: 'Iceland', startDate: '2026-07-02', endDate: '2026-07-09' },
        credentials: {
          education: {
            verified: true,
            degreeLevel: 'bachelor',
            tierTag: 'general',
            displayTag: 'x',
            verificationChannel: 'xuexin_online_code',
            badge: {} as any,
            verifiedAt: '2026-01-01',
          },
        },
      },
      teamworkStyle: 'full_managed',
    });

    expect(result.hardBlocked).toBe(false);
    expect(result.compatibilityPercent).toBeGreaterThanOrEqual(60);
    expect(result.breakdown?.teamworkFitPoints).toBeGreaterThanOrEqual(20);
    expect(result.insightDrawer?.lines.length).toBeGreaterThan(0);
  });

  it('blocks extreme social bandwidth gap', () => {
    const elite = buildUserFeatureVector({
      mbtiType: 'INTJ',
      rawScores: premiumLeaderScores,
      credentials: {
        education: {
          verified: true,
          degreeLevel: 'doctor',
          tierTag: 'qs_top50',
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
    });
    const unverified = buildUserFeatureVector({
      mbtiType: 'ISFP',
      rawScores: passiveMemberScores,
    });
    expect(failsSocialBandwidthGate(elite, unverified)).toBe(true);
  });

  it('penalizes dual dominant control styles', () => {
    const leader = buildUserFeatureVector({ mbtiType: 'ENTJ', rawScores: premiumLeaderScores });
    const member = buildUserFeatureVector({ mbtiType: 'ESTJ', rawScores: premiumLeaderScores });
    expect(computeTeamworkFitPoints(leader, member, 'full_managed')).toBeLessThan(0);
  });

  it('applies stress penalty for quality mismatch', () => {
    const leader = buildUserFeatureVector({
      mbtiType: 'INTJ',
      rawScores: premiumLeaderScores,
    });
    const member = buildUserFeatureVector({
      mbtiType: 'ISFP',
      rawScores: passiveMemberScores,
    });
    expect(computeStressFitPoints(leader, member)).toBeLessThan(0);
  });
});
