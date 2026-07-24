import {
  applyRouteDeviationToLiveState,
  buildRouteDeviationEvent,
  minDistanceToPolylineM,
} from './hike-plan-route-deviation.util';
import { normalizeLiveState } from './hike-plan-live-state.util';

describe('hike-plan-route-deviation.util', () => {
  const line = [
    { lat: 64.0, lng: -19.0 },
    { lat: 64.01, lng: -19.0 },
  ];

  it('minDistanceToPolylineM is ~0 on the line', () => {
    const d = minDistanceToPolylineM({ lat: 64.005, lng: -19.0 }, line);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(5);
  });

  it('buildRouteDeviationEvent matches contract', () => {
    const e = buildRouteDeviationEvent(80, 50);
    expect(e).toMatchObject({
      type: 'route',
      message: '您已偏离路线 80m，建议回到轨迹',
      threshold: { metric: 'distance_m', current: 80, value: 50 },
    });
  });

  it('applyRouteDeviationToLiveState adds route event when over threshold', () => {
    const base = normalizeLiveState({ events: [] });
    const out = applyRouteDeviationToLiveState(base, 80, 50);
    expect(out.events?.some((e) => e.type === 'route')).toBe(true);
    expect(out.events?.find((e) => e.type === 'route')?.threshold?.current).toBe(80);
  });

  it('applyRouteDeviationToLiveState clears route event when back on trail', () => {
    const base = normalizeLiveState({
      events: [buildRouteDeviationEvent(90, 50)],
    });
    const out = applyRouteDeviationToLiveState(base, 30, 50);
    expect(out.events?.some((e) => e.type === 'route')).toBe(false);
  });
});
