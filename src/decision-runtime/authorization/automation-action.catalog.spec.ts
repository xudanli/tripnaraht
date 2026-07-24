import {
  AUTOMATION_ACTION_CATALOG,
  COLD_START_AUTOMATION_ACTION_KEYS,
  getAutomationActionByKey,
  listColdStartAutomationActions,
  pickMostRestrictiveTier,
  resolveMatchingAutomationActions,
} from './automation-action.catalog';

describe('automation-action.catalog', () => {
  it('defines 6 groups with unique action keys', () => {
    const keys = AUTOMATION_ACTION_CATALOG.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });

  it('marks exactly 10 cold-start actions', () => {
    expect(listColdStartAutomationActions()).toHaveLength(10);
    expect(COLD_START_AUTOMATION_ACTION_KEYS).toHaveLength(10);
  });

  it('resolves weather hazard semantic keys', () => {
    const matched = resolveMatchingAutomationActions({
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    });
    expect(matched.some((a) => a.key === 'monitoring.weather_road_update')).toBe(true);
    expect(matched.some((a) => a.key === 'activity.generate_plan_b')).toBe(true);
  });

  it('resolves road closure semantic keys to reroute action', () => {
    const matched = resolveMatchingAutomationActions({
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt_1',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
    });
    expect(matched.some((a) => a.key === 'time_route.reroute_for_closure')).toBe(true);
    expect(matched.some((a) => a.key === 'monitoring.weather_road_update')).toBe(false);
  });

  it('payment action is DENY with floor', () => {
    const payment = getAutomationActionByKey('booking.payment');
    expect(payment?.defaultTier).toBe('DENY');
    expect(payment?.floorTier).toBe('DENY');
  });

  it('pickMostRestrictiveTier prefers DENY over ASK over AUTO', () => {
    expect(pickMostRestrictiveTier(['AUTO', 'ASK'])).toBe('ASK');
    expect(pickMostRestrictiveTier(['AUTO', 'DENY'])).toBe('DENY');
    expect(pickMostRestrictiveTier(['ASK', 'AUTO'])).toBe('ASK');
  });
});
