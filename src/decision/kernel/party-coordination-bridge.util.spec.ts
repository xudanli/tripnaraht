import {
  attachPartyCoordinationToResearchData,
  buildTravelersFromParty,
  shouldRunPartyCoordination,
  summarizePartyCoordination,
} from './party-coordination-bridge.util';
import type { CoordinationResult } from '../../trips/decision/interfaces/multi-person-coordination.interface';

describe('party-coordination-bridge.util (PR-4)', () => {
  it('shouldRunPartyCoordination when party count >= 2', () => {
    expect(shouldRunPartyCoordination({ userIntent: { party: { count: 2 } } } as any)).toBe(true);
    expect(shouldRunPartyCoordination({ userIntent: { party: { count: 1 } } } as any)).toBe(false);
  });

  it('buildTravelersFromParty splits elderly companion', () => {
    const travelers = buildTravelersFromParty({
      userIntent: { party: { count: 2, has_elderly: true } },
    } as any);
    expect(travelers.length).toBe(2);
    expect(travelers.reduce((s, t) => s + t.count, 0)).toBe(2);
  });

  it('attachPartyCoordinationToResearchData writes partyCoordination block', () => {
    const result: CoordinationResult = {
      individualAnalysis: [],
      conflictAreas: [{ id: 'c1', type: 'RHYTHM_MISMATCH', severity: 'HIGH', involvedTravelers: ['t0'], description: 'd', reason: 'r', impact: [] }],
      consensus: [],
      optionsForCoordination: [{ id: 'o1', strategy: 'COMPROMISE_MIDDLE', description: 'd', implementation: [], resolvedConflicts: [], advantages: [], disadvantages: [], suitabilityScore: 0.7, expectedSatisfaction: {} }],
      suggestedDiscussionPoints: [],
      overallRecommendation: 'Discuss rhythm',
    };
    const rd = attachPartyCoordinationToResearchData({ research_data: {} } as any, result);
    expect((rd as any).partyCoordination?.schemaVersion).toBe('party-coordination/v1');
    expect(summarizePartyCoordination(result).highSeverityCount).toBe(1);
  });
});
