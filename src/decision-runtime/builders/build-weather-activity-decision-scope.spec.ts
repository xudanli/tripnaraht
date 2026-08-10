import { buildWeatherActivityDecisionScope } from './build-weather-activity-decision-scope';
import { assertCandidateWithinDecisionScope } from '../contracts/decision-scope.types';

describe('buildWeatherActivityDecisionScope', () => {
  it('allows REPLACE_ITEM on affected plan items (live weather L2)', () => {
    const scope = buildWeatherActivityDecisionScope({
      snapshotId: 'ws_weather_1',
      tripId: 'trip_is',
      affectedPlanItemIds: ['item_glacier', 'item_beach'],
      affectedDayIndex: 2,
    });
    expect(scope.snapshotId).toBe('ws_weather_1');
    expect(scope.trigger).toBe('WEATHER_ACTIVITY_PROHIBITED');
    expect(scope.affectedDays).toEqual([2]);
    expect(
      assertCandidateWithinDecisionScope(scope, {
        actionType: 'REPLACE_ITEM',
        targetObjectIds: ['item_glacier'],
      }),
    ).toEqual({ ok: true });
    expect(
      assertCandidateWithinDecisionScope(scope, {
        actionType: 'DIRECT_SET_EFFECTIVE',
        targetObjectIds: ['item_glacier'],
      }).ok,
    ).toBe(false);
  });
});
