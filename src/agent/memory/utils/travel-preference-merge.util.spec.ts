import {
  buildMergedTravelPreferenceSummary,
  sortInterestTailByRiskTolerance,
  travelPhilosophyToImplicitInterestCodes,
} from './travel-preference-merge.util';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import type { AgentMemoryUserBasics } from '../interfaces/agent-memory-context.interface';

function profile(overrides: Partial<UserTravelProfile>): UserTravelProfile {
  return {
    userId: 'u1',
    pacePreference: 'MODERATE',
    altitudeTolerance: 'MEDIUM',
    riskTolerance: 'MEDIUM',
    travelPhilosophy: 'SCENIC',
    preferredRouteTypes: [],
    confidence: 0.4,
    source: 'mixed',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('travel-preference-merge.util', () => {
  it('L0 在前，L1 路线类型与哲学码去重补尾', () => {
    const basics: AgentMemoryUserBasics = Object.freeze({
      preferredAttractionTypes: ['MUSEUM', 'nature'],
      profilePreferencesUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    const p = profile({
      preferredRouteTypes: ['URBAN', 'NATURE'],
      travelPhilosophy: 'ADVENTURE',
      riskTolerance: 'LOW',
    });
    const sum = buildMergedTravelPreferenceSummary({ profile: p, routeParty: null, basics })!;
    expect(sum.mergedInterests).toEqual(['MUSEUM', 'NATURE', 'URBAN', 'ADVENTURE']);
    expect(sum.hasExplicitSettings).toBe(true);
    expect(sum.constraintStrictness).toBe('high');
    expect(sum.l0_preferences_updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('L0 为空时回退为仅 L1，并按风险偏好排序', () => {
    const p = profile({
      preferredRouteTypes: ['URBAN', 'HIKING', 'NATURE'],
      travelPhilosophy: 'RELAXED',
      riskTolerance: 'HIGH',
    });
    const sum = buildMergedTravelPreferenceSummary({ profile: p, routeParty: null, basics: null })!;
    expect(sum.mergedInterests).toEqual(
      sortInterestTailByRiskTolerance(['URBAN', 'HIKING', 'NATURE', 'RELAXED', 'LEISURE'], 'HIGH'),
    );
    expect(sum.hasExplicitSettings).toBe(false);
    expect(sum.constraintStrictness).toBe('normal');
  });

  it('philosophy 隐式码', () => {
    expect(travelPhilosophyToImplicitInterestCodes('SCENIC')).toEqual(['SCENIC', 'NATURE']);
    expect(travelPhilosophyToImplicitInterestCodes(undefined)).toEqual([]);
  });

  it('仅 L0、无 L1 时仍产出摘要', () => {
    const basics: AgentMemoryUserBasics = Object.freeze({
      preferredAttractionTypes: ['MUSEUM'],
      nationality: 'CN',
    });
    const sum = buildMergedTravelPreferenceSummary({ profile: null, routeParty: null, basics })!;
    expect(sum.mergedInterests).toEqual(['MUSEUM']);
    expect(sum.confidence).toBe(0.5);
    expect(sum.hasExplicitSettings).toBe(true);
  });

  it('全无信号时返回 null', () => {
    expect(buildMergedTravelPreferenceSummary({ profile: null, routeParty: null, basics: null })).toBeNull();
  });
});
