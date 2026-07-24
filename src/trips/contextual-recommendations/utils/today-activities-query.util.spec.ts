import {
  mapTodayActivitiesQueryToRecommendBody,
  isSameDayActivitiesMode,
} from '../utils/today-activities-query.util';

describe('today-activities-query.util', () => {
  it('detects same-day mode flags', () => {
    expect(isSameDayActivitiesMode({ mode: 'same_day' })).toBe(true);
    expect(isSameDayActivitiesMode({ mode: 'SAME_DAY_ACTIVITY' })).toBe(true);
    expect(isSameDayActivitiesMode({ sameDay: '1' })).toBe(true);
    expect(isSameDayActivitiesMode({ sameDay: 'true' })).toBe(true);
    expect(isSameDayActivitiesMode({})).toBe(false);
    expect(isSameDayActivitiesMode({ mode: 'explore' })).toBe(false);
  });

  it('maps query params into contextual recommend body', () => {
    const body = mapTodayActivitiesQueryToRecommendBody({
      dayIndex: 1,
      intent: '刚落地很累',
      energy: 'LOW',
      returnBy: '21:00',
      lat: 63.985,
      lng: -22.605,
      tripPhase: 'ARRIVAL_DAY',
    });
    expect(body.scenario).toBe('SAME_DAY_ACTIVITY');
    expect(body.dayIndex).toBe(1);
    expect(body.intent).toBe('刚落地很累');
    expect(body.contextDelta?.teamState?.energy).toBe('LOW');
    expect(body.contextDelta?.desiredReturnTime).toBe('21:00');
    expect(body.contextDelta?.currentLocation).toMatchObject({
      lat: 63.985,
      lng: -22.605,
    });
  });
});
