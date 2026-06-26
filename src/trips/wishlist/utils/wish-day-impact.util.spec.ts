import type { TripWishItemRecord } from '../types/trip-wish.types';
import { computeDayWishImpact, type TripDayContext } from './wish-day-impact.util';

function wish(partial: Partial<TripWishItemRecord> & Pick<TripWishItemRecord, 'id' | 'category' | 'text'>): TripWishItemRecord {
  return {
    tripId: 'trip-1',
    userId: 'user-1',
    importance: 3,
    inputMode: 'free_text',
    sourceRef: null,
    visibility: 'private',
    agentEligible: true,
    structuredHints: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('computeDayWishImpact', () => {
  const day1: TripDayContext = {
    dayIndex: 1,
    date: '2026-11-01',
    textBlob: 'black beach suites hotel vik',
    poiIds: ['123'],
  };
  const day2: TripDayContext = {
    dayIndex: 2,
    date: '2026-11-02',
    textBlob: 'jokulsarlon glacier lagoon',
    poiIds: ['jokulsarlon'],
  };

  it('counts global categories on every day', () => {
    const wishes = [
      wish({
        id: 'w1',
        category: 'destination_route',
        text: '不要太赶',
        structuredHints: { pace: 'relaxed', tags: ['pace_relaxed'] },
      }),
    ];
    const result = computeDayWishImpact(wishes, [day1, day2]);
    expect(result).toEqual([
      { dayIndex: 1, impactCount: 1, wishIds: ['w1'] },
      { dayIndex: 2, impactCount: 1, wishIds: ['w1'] },
    ]);
  });

  it('matches POI-specific wishes to relevant days only', () => {
    const wishes = [
      wish({
        id: 'w2',
        category: 'activities',
        text: '想去杰古沙龙冰河湖',
        structuredHints: { must_do: ['jokulsarlon'], tags: ['glacier'] },
      }),
    ];
    const result = computeDayWishImpact(wishes, [day1, day2]);
    expect(result[0].impactCount).toBe(0);
    expect(result[1].impactCount).toBe(1);
    expect(result[1].wishIds).toEqual(['w2']);
  });

  it('ignores non-private or inactive wishes', () => {
    const wishes = [
      wish({
        id: 'w3',
        category: 'accommodation',
        text: '控制住宿预算',
        visibility: 'anonymous',
      }),
      wish({
        id: 'w4',
        category: 'accommodation',
        text: '私密预算',
        status: 'archived',
      }),
    ];
    const result = computeDayWishImpact(wishes, [day1]);
    expect(result[0].impactCount).toBe(0);
  });
});
