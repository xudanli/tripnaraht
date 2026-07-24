import { mergeSameDayProblem } from './same-day-context-merge.util';
import { planInTripDayMicroItinerary } from './same-day-in-trip-planner.util';
import type { CanonicalSameDayContext } from '../types/contextual-recommendations.types';

describe('same-day-in-trip-planner.util', () => {
  const canonical: CanonicalSameDayContext = {
    tripId: 'trip_123',
    destination: 'IS',
    countryCode: 'IS',
    focusDayIndex: 3,
    tripPhase: 'IN_TRIP',
    hotel: {
      name: 'Hotel Vik',
      cityName: '维克',
      confirmed: true,
    },
    tomorrow: {
      dayIndex: 4,
      firstActivityStart: '08:00',
      earlyDeparture: true,
    },
    team: {
      memberCount: 4,
      childrenPresent: true,
      elderlyPresent: false,
      physicalConstraints: [],
    },
    sources: { fromDelta: [], fromBackend: ['focusDayIndex'] },
  };

  it('plans a local evening window without far attractions', () => {
    const problem = mergeSameDayProblem({
      canonical,
      intent: '晚饭后还有时间吗，想轻松逛逛',
      contextDelta: {
        currentTime: '2026-07-18T17:30:00Z',
        desiredReturnTime: '21:00',
        tripPhase: 'IN_TRIP',
        teamState: { energy: 'MEDIUM' },
        preference: ['吃饭', '简单逛逛'],
      },
    });

    const view = planInTripDayMicroItinerary(problem);
    expect(view).not.toBeNull();
    expect(view!.recommendation.reasonCodes).toEqual(
      expect.arrayContaining(['IN_TRIP_DAY', 'LOCAL_ANCHOR_ONLY']),
    );
    expect(view!.context.focusDayIndex).toBe(3);
    expect(view!.observation.summary).toMatch(/维克|剩余/);
    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/教会山|Kirkjufell|蓝湖/i);
  });

  it('returns null for arrival day', () => {
    const problem = mergeSameDayProblem({
      canonical: { ...canonical, tripPhase: 'ARRIVAL_DAY' },
      contextDelta: { tripPhase: 'ARRIVAL_DAY' },
    });
    expect(planInTripDayMicroItinerary(problem)).toBeNull();
  });
});
