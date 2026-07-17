import {
  mergeSameDayProblem,
  parseClockToMinutes,
  formatMinutesAsClock,
} from './same-day-context-merge.util';
import type { CanonicalSameDayContext } from '../types/contextual-recommendations.types';

describe('same-day-context-merge.util', () => {
  const canonical: CanonicalSameDayContext = {
    tripId: 'trip_123',
    destination: 'IS',
    countryCode: 'IS',
    focusDayIndex: 1,
    tripPhase: 'ARRIVAL_DAY',
    hotel: {
      name: 'Downtown Hotel',
      cityName: '雷克雅未克',
      lat: 64.1466,
      lng: -21.9426,
      confirmed: true,
      placeId: 1,
    },
    tomorrow: {
      dayIndex: 2,
      firstActivityStart: '08:30',
      theme: '黄金圈',
      earlyDeparture: true,
    },
    team: {
      memberCount: 4,
      childrenPresent: true,
      elderlyPresent: false,
      physicalConstraints: ['一名成员体能较弱'],
    },
    sources: { fromDelta: [], fromBackend: ['trip.destination'] },
  };

  it('merges delta without overwriting hotel / team / tomorrow', () => {
    const problem = mergeSameDayProblem({
      canonical,
      intent: '今晚还有什么适合全家的活动',
      contextDelta: {
        currentLocation: { lat: 63.985, lng: -22.605, label: 'Keflavik Airport' },
        currentTime: '2026-07-16T16:20:00+00:00',
        availableUntil: '21:00',
        teamState: { energy: 'LOW', temporaryConstraints: ['MOTION_SICKNESS'] },
        desiredIntensity: 'LIGHT',
        preference: ['吃饭', '早点回酒店'],
      },
    });

    expect(problem.canonical.hotel?.cityName).toBe('雷克雅未克');
    expect(problem.canonical.hotel?.confirmed).toBe(true);
    expect(problem.canonical.team.childrenPresent).toBe(true);
    expect(problem.canonical.tomorrow?.earlyDeparture).toBe(true);
    expect(problem.energy).toBe('LOW');
    expect(problem.desiredIntensity).toBe('LIGHT');
    expect(problem.currentLocation?.lat).toBeCloseTo(63.985);
    expect(problem.canonical.sources.fromDelta).toEqual(
      expect.arrayContaining(['currentLocation', 'teamState.energy', 'preference']),
    );
    expect(problem.canonical.sources.fromBackend).toContain('trip.destination');
  });

  it('resolves Keflavik string location', () => {
    const problem = mergeSameDayProblem({
      canonical,
      contextDelta: { currentLocation: '凯夫拉维克机场' },
    });
    expect(problem.currentLocation?.lat).toBeCloseTo(63.985);
  });

  it('parses clock helpers', () => {
    expect(parseClockToMinutes('16:20')).toBe(16 * 60 + 20);
    expect(parseClockToMinutes('2026-07-16T18:15:00+00:00')).toBe(18 * 60 + 15);
    expect(formatMinutesAsClock(18 * 60 + 15)).toBe('18:15');
  });
});
