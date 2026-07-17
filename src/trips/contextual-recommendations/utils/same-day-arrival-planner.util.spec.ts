import { mergeSameDayProblem } from './same-day-context-merge.util';
import {
  isRejectedArrivalActivityKey,
  planArrivalDayMicroItinerary,
} from './same-day-arrival-planner.util';
import type { CanonicalSameDayContext } from '../types/contextual-recommendations.types';

describe('same-day-arrival-planner.util', () => {
  const canonical: CanonicalSameDayContext = {
    tripId: 'trip_123',
    destination: 'IS',
    countryCode: 'IS',
    focusDayIndex: 1,
    tripPhase: 'ARRIVAL_DAY',
    hotel: {
      name: 'Reykjavik Centrum Hotel',
      cityName: '雷克雅未克',
      lat: 64.1466,
      lng: -21.9426,
      confirmed: true,
    },
    tomorrow: {
      dayIndex: 2,
      firstActivityStart: '08:30',
      earlyDeparture: true,
    },
    team: {
      memberCount: 4,
      childrenPresent: true,
      elderlyPresent: false,
      physicalConstraints: [],
    },
    sources: { fromDelta: [], fromBackend: ['day1.accommodation'] },
  };

  it('plans a light arrival-day micro itinerary for low-energy family at KEF', () => {
    const problem = mergeSameDayProblem({
      canonical,
      intent: '今晚还有什么适合全家的活动',
      contextDelta: {
        currentLocation: { lat: 63.985, lng: -22.605 },
        currentTime: '2026-07-16T16:20:00Z',
        desiredReturnTime: '21:00',
        tripPhase: 'ARRIVAL_DAY',
        teamState: {
          energy: 'LOW',
          temporaryConstraints: ['刚完成长途飞行', 'MOTION_SICKNESS'],
        },
        desiredIntensity: 'LIGHT',
        preference: ['吃饭', '早点回酒店'],
      },
    });

    const view = planArrivalDayMicroItinerary(problem);
    expect(view).not.toBeNull();
    expect(view!.recommendation.gate).toBe('ALLOW');
    expect(view!.recommendation.reasonCodes).toEqual(
      expect.arrayContaining([
        'ARRIVAL_DAY',
        'LOW_TEAM_ENERGY',
        'EARLY_DEPARTURE_TOMORROW',
        'NO_RESERVATION_REQUIRED',
        'HOTEL_CONFIRMED',
      ]),
    );
    expect(view!.recommendation.schedule.some((s) => s.type === 'HOTEL_CHECK_IN')).toBe(true);
    expect(view!.recommendation.schedule.some((s) => s.type === 'DINING')).toBe(true);
    expect(view!.recommendation.impact.tomorrowPlanImpact).toBe('NONE');
    expect(view!.alternatives.length).toBeLessThanOrEqual(2);
    expect(view!.observation.summary).toMatch(/体力|早出发|冰岛/);
    // Must not be a Kirkjufell / Blue Lagoon style card dump
    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/教会山|Kirkjufell|蓝湖|Blue Lagoon/i);
  });

  it('prefers relaxed plan and WEATHER_ADVERSE when windy', () => {
    const problem = mergeSameDayProblem({
      canonical: {
        ...canonical,
        weatherHint: '大风约 40 km/h',
      },
      contextDelta: {
        currentTime: '2026-07-16T16:20:00Z',
        desiredReturnTime: '21:00',
        tripPhase: 'ARRIVAL_DAY',
        teamState: { energy: 'MEDIUM' },
        desiredIntensity: 'MODERATE',
      },
    });
    const view = planArrivalDayMicroItinerary(problem);
    expect(view).not.toBeNull();
    expect(view!.recommendation.reasonCodes).toContain('WEATHER_ADVERSE');
    expect(view!.observation.summary).toMatch(/风雨|大风/);
    expect(view!.recommendation.schedule.some((s) => s.type === 'LIGHT_ACTIVITY')).toBe(false);
  });

  it('rejects high-load arrival activity keys', () => {
    expect(isRejectedArrivalActivityKey('Kirkjufell')).toBe(true);
    expect(isRejectedArrivalActivityKey('blue_lagoon')).toBe(true);
    expect(isRejectedArrivalActivityKey('poi_sun_voyager')).toBe(false);
  });

  it('returns null when not arrival day', () => {
    const problem = mergeSameDayProblem({
      canonical: { ...canonical, tripPhase: 'IN_TRIP' },
      contextDelta: { tripPhase: 'IN_TRIP' },
    });
    expect(planArrivalDayMicroItinerary(problem)).toBeNull();
  });
});
