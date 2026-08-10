import { buildSelfDriveContext } from '../builders/build-self-drive-context';
import { clearDestinationSelfDriveCapabilitiesCache } from '../capabilities/resolve-destination-self-drive-capabilities';
import { clearClassicDaySkeletonCache } from '../route/load-classic-day-skeleton';
import { runSelfDriveEngines } from './run-self-drive-engines';
import { projectSelfDriveDailyDrive } from '../projectors/project-self-drive-daily-drive';

describe('runSelfDriveEngines (K3)', () => {
  beforeEach(() => {
    clearDestinationSelfDriveCapabilitiesCache();
    clearClassicDaySkeletonCache();
  });

  it('CN G318: NEED_CONFIRM with altitude/checkpoint drivers + recovery', () => {
    const ctx = buildSelfDriveContext({
      tripId: 'trip-cn',
      destination: 'CN',
      classicRouteId: 'cn.route.g318',
      dayIndex: 1,
      preferredDays: 14,
      metadata: {
        isSelfDrive: true,
        classicRouteId: 'cn.route.g318',
        drivingContext: {
          classicRouteId: 'cn.route.g318',
          wantsXizang: true,
          requiresAltitudeAcclimatization: true,
          checkpointLikely: true,
          roadStatus: 'RESTRICTED',
          seasonWindowIds: ['g318_rainy_season'],
          cityLimitCities: ['成都'],
          advisoriesCN: ['涉藏行程'],
        },
      },
    });

    const engines = runSelfDriveEngines(ctx);
    expect(engines.schemaId).toBe('tripnara.self_drive_engines@v1');
    expect(engines.routeUnderstanding.corridorId).toBe('cn.route.g318');
    expect(['NEED_CONFIRM', 'SUGGEST_REPLACE', 'BLOCK']).toContain(
      engines.executability.verdict,
    );
    expect(engines.executability.drivers).toEqual(
      expect.arrayContaining(['CHECKPOINT']),
    );
    expect(engines.recovery.recommendedActions.length).toBeGreaterThan(0);

    const daily = projectSelfDriveDailyDrive(ctx, engines);
    expect(daily.schemaId).toBe('tripnara.self_drive_daily_drive@v1');
    expect(daily.advisories.some((a) => a.type === 'ALTITUDE')).toBe(true);
    expect(daily.countryCode).toBe('CN');
  });

  it('IS 2WD + highland corridor: VEHICLE_ROAD_MISMATCH → BLOCK', () => {
    const ctx = buildSelfDriveContext({
      tripId: 'trip-is',
      destination: 'IS',
      classicRouteId: 'is.route.highlands',
      dayIndex: 1,
      metadata: {
        productLine: 'iceland_self_drive',
        classicRouteId: 'is.route.highlands',
        icelandSelfDrive: {
          classicRouteId: 'is.route.highlands',
          routeStrategy: 'HIGHLANDS',
        },
        constraints: { vehicle_type: '2WD' },
      },
    });

    // 若骨架无 highlands day，人工注入 critical F_ROAD 段以测 fit
    if (!ctx.route.criticalSegments.some((s) => s.criticalReasons.includes('F_ROAD'))) {
      ctx.route.criticalSegments.push({
        segmentId: 'seg:is.route.highlands:d1:synthetic',
        corridorId: 'is.route.highlands',
        dayIndex: 1,
        fromLabel: 'Reykjavík',
        toLabel: 'Landmannalaugar',
        distanceKmHint: 180,
        isCritical: true,
        criticalReasons: ['F_ROAD', 'FORD'],
      });
      ctx.route.segments.push(ctx.route.criticalSegments[0]);
    }

    const engines = runSelfDriveEngines(ctx);
    expect(engines.vehicleRoadFit.reason).toBe('VEHICLE_ROAD_MISMATCH');
    expect(engines.executability.verdict).toBe('BLOCK');
    expect(engines.recovery.recommendedActions.some((a) => a.action === 'REROUTE')).toBe(
      true,
    );
  });
});
