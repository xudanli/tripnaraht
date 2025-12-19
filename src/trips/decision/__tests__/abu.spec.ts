// src/trips/decision/__tests__/abu.spec.ts

/**
 * Abu 策略单元测试
 */

import { abuSelectCoreActivities } from '../strategies/abu';
import { TripWorldState, ActivityCandidate } from '../world-model';

describe('abuSelectCoreActivities', () => {
  let mockState: TripWorldState;

  beforeEach(() => {
    mockState = {
      context: {
        destination: 'IS',
        startDate: '2026-01-02',
        durationDays: 1,
        preferences: {
          intents: { nature: 0.8, culture: 0.4 },
          pace: 'moderate',
          riskTolerance: 'medium',
        },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  });

  it('should keep mustSee activities', () => {
    const candidates: ActivityCandidate[] = [
      {
        id: 'poi1',
        name: { en: 'Must See' },
        type: 'sightseeing',
        durationMin: 60,
        mustSee: true,
      },
      {
        id: 'poi2',
        name: { en: 'Optional' },
        type: 'sightseeing',
        durationMin: 60,
        mustSee: false,
      },
    ];

    const result = abuSelectCoreActivities(
      mockState,
      '2026-01-02',
      candidates,
      { maxActiveMin: 120 }
    );

    expect(result.kept).toHaveLength(2);
    expect(result.kept.some(c => c.id === 'poi1')).toBe(true);
    expect(result.kept.some(c => c.id === 'poi2')).toBe(true);
  });

  it('should drop activities when time budget exceeded', () => {
    const candidates: ActivityCandidate[] = [
      {
        id: 'poi1',
        name: { en: 'Activity 1' },
        type: 'sightseeing',
        durationMin: 60,
      },
      {
        id: 'poi2',
        name: { en: 'Activity 2' },
        type: 'sightseeing',
        durationMin: 60,
      },
      {
        id: 'poi3',
        name: { en: 'Activity 3' },
        type: 'sightseeing',
        durationMin: 60,
      },
    ];

    const result = abuSelectCoreActivities(
      mockState,
      '2026-01-02',
      candidates,
      { maxActiveMin: 120 } // 只能容纳2个活动
    );

    expect(result.kept.length).toBeLessThanOrEqual(2);
    expect(result.dropped.length).toBeGreaterThan(0);
  });

  it('should respect alternativeGroupId', () => {
    const candidates: ActivityCandidate[] = [
      {
        id: 'poi1',
        name: { en: 'Waterfall A' },
        type: 'nature',
        durationMin: 60,
        alternativeGroupId: 'waterfalls',
      },
      {
        id: 'poi2',
        name: { en: 'Waterfall B' },
        type: 'nature',
        durationMin: 60,
        alternativeGroupId: 'waterfalls',
      },
    ];

    const result = abuSelectCoreActivities(
      mockState,
      '2026-01-02',
      candidates,
      { maxActiveMin: 200 }
    );

    // 应该只保留一个瀑布
    const keptWaterfalls = result.kept.filter(
      c => c.alternativeGroupId === 'waterfalls'
    );
    expect(keptWaterfalls.length).toBe(1);
  });

  it('should provide reasons for kept and dropped activities', () => {
    const candidates: ActivityCandidate[] = [
      {
        id: 'poi1',
        name: { en: 'Activity 1' },
        type: 'sightseeing',
        durationMin: 60,
        mustSee: true,
      },
      {
        id: 'poi2',
        name: { en: 'Activity 2' },
        type: 'sightseeing',
        durationMin: 60,
      },
    ];

    const result = abuSelectCoreActivities(
      mockState,
      '2026-01-02',
      candidates,
      { maxActiveMin: 120 }
    );

    expect(result.reasonsById['poi1']).toBeDefined();
    expect(result.reasonsById['poi1']).toContain('mustSee');
  });
});

