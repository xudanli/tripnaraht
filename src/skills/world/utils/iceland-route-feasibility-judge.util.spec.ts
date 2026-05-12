import { judgeRouteFeasibility, collectFRoadIdsFromSegments } from './iceland-route-feasibility-judge.util';
import type { FRoadStatus } from '../iceland-world-driving-contracts';

describe('iceland-route-feasibility-judge', () => {
  const baseCtx = (over: Partial<Parameters<typeof judgeRouteFeasibility>[2]>) => ({
    fRoadStatuses: [] as FRoadStatus[],
    weather: { travelRisk: 'safe' as const, drivingRecommendation: [] },
    wind: { region: 't', crosswindRisk: 'low' as const, campervanWarning: false, dangerousSegments: [] },
    estimatedDrivingHours: 2,
    safeDrivingWindowHours: 8,
    usedDistanceHeuristic: false,
    temporalMileageUnbounded: false,
    polarNightCompact: false,
    ...over,
  });

  it('collects F-road ids from segments', () => {
    expect(
      collectFRoadIdsFromSegments([
        { from_region: 'reykjavik', to_region: 'vik', roadId: 'F208' },
        { from_region: 'vik', to_region: 'hofn' },
      ]),
    ).toEqual(['F208']);
  });

  it('hard-blocks 2wd with F-road intent', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'reykjavik', to_region: 'vik', roadId: 'F208' }],
      { type: '2wd' },
      baseCtx({}),
    );
    expect(r.feasible).toBe(false);
    expect(r.blockedReasons).toContain('VEHICLE_TYPE_INCOMPATIBLE');
  });

  it('blocks camper on camperRestricted F-road', () => {
    const fRoadStatuses: FRoadStatus[] = [
      {
        roadId: 'F208',
        status: 'open',
        requires4x4: true,
        riverCrossing: true,
        camperRestricted: true,
        confidence: 0.9,
      },
    ];
    const r = judgeRouteFeasibility(
      [{ from_region: 'vik', to_region: 'highlands_center', roadId: 'F208' }],
      { type: 'campervan' },
      baseCtx({ fRoadStatuses }),
    );
    expect(r.feasible).toBe(false);
    expect(r.blockedReasons).toContain('CAMPER_FR_RESTRICTED');
  });

  it('blocks dangerous weather', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'vik', to_region: 'vik' }],
      { type: '4x4' },
      baseCtx({ weather: { travelRisk: 'dangerous', drivingRecommendation: ['x'] } }),
    );
    expect(r.feasible).toBe(false);
    expect(r.blockedReasons).toContain('WEATHER_SEVERITY_BLOCK');
  });

  it('blocks camper + extreme wind', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'vik', to_region: 'hofn' }],
      { type: 'campervan' },
      baseCtx({ wind: { region: 'x', crosswindRisk: 'extreme', campervanWarning: true, dangerousSegments: [] } }),
    );
    expect(r.feasible).toBe(false);
    expect(r.blockedReasons).toContain('WIND_CAMPERVAN_EXTREME');
  });

  it('raises mileage vs daylight as adjustments', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'reykjavik', to_region: 'reykjavik' }],
      { type: '4x4' },
      baseCtx({ estimatedDrivingHours: 12, safeDrivingWindowHours: 6 }),
    );
    expect(r.feasible).toBe(true);
    expect(r.recommendedAdjustments).toContain('REDUCE_DAILY_MILEAGE');
  });

  it('skips temporal mileage pressure when midnight sun / unbounded', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'reykjavik', to_region: 'reykjavik' }],
      { type: '4x4' },
      baseCtx({
        estimatedDrivingHours: 20,
        safeDrivingWindowHours: 6,
        temporalMileageUnbounded: true,
      }),
    );
    expect(r.recommendedAdjustments).not.toContain('REDUCE_DAILY_MILEAGE');
  });

  it('polar night compact adds night driving + stay extensions', () => {
    const r = judgeRouteFeasibility(
      [{ from_region: 'akureyri', to_region: 'akureyri' }],
      { type: '4x4' },
      baseCtx({ polarNightCompact: true }),
    );
    expect(r.recommendedAdjustments).toContain('NIGHT_DRIVING_REQUIRED');
    expect(r.recommendedAdjustments).toContain('EXTEND_STAY_DAYS');
  });
});
