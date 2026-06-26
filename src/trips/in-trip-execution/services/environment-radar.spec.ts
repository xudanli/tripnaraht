import { AlternativePlanGeneratorService } from './alternative-plan-generator.service';
import { severityFromStabilityScore } from '../utils/severity.util';

describe('severityFromStabilityScore', () => {
  it('maps score bands to severity', () => {
    expect(severityFromStabilityScore(0.85)).toBe('green');
    expect(severityFromStabilityScore(0.65)).toBe('yellow');
    expect(severityFromStabilityScore(0.4)).toBe('red');
  });
});

describe('AlternativePlanGeneratorService', () => {
  const service = new AlternativePlanGeneratorService();
  const anchor = {
    tripId: 't1',
    materializedAt: 'x',
    schemaVersion: 1 as const,
    budget: {} as any,
    team: {} as any,
    conflictWatchlist: [],
    metadata: {
      destination: 'IS',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      totalDays: 3,
      timezone: 'Atlantic/Reykjavik',
    },
    itinerary: {
      planId: null,
      lockedAt: 'x',
      bigTransportRefs: [],
      nonRefundableItemIds: [],
      days: [
        {
          date: '2026-07-02',
          items: [
            {
              id: 'glacier-1',
              type: 'ACTIVITY',
              title: '冰川徒步',
              refundable: false,
              estimatedCost: 3000,
              category: 'activities',
            },
          ],
        },
      ],
    },
  };

  it('generates three alternative plans for affected items', () => {
    const { plans, cascadeImpact } = service.generate(
      anchor as any,
      '暴风雪影响冰川徒步',
      {
        eventId: 'e1',
        affectedItems: ['glacier-1'],
        affectedDays: ['2026-07-02'],
        severity: 'HIGH',
        recommendedActions: ['REPLACE'],
        rootConfidence: 0.9,
        propagationDepth: 1,
        cascadeConfidence: 0.8,
        summaryZh: '冰川活动可能取消',
      },
      ['glacier-1'],
    );

    expect(plans).toHaveLength(3);
    expect(plans[0].experienceEquivalence).toBeGreaterThan(0.6);
    expect(cascadeImpact.length).toBeGreaterThan(0);
  });
});
