import { SELF_DRIVE_CONTEXT_SCHEMA } from '../contracts/self-drive-context.types';
import { clearDestinationSelfDriveCapabilitiesCache } from '../capabilities/resolve-destination-self-drive-capabilities';
import { clearClassicDaySkeletonCache } from '../route/load-classic-day-skeleton';
import { buildSelfDriveContext } from './build-self-drive-context';

describe('buildSelfDriveContext (K1)', () => {
  beforeEach(() => {
    clearDestinationSelfDriveCapabilitiesCache();
    clearClassicDaySkeletonCache();
  });

  it('CN G318 trip: same schema + critical segments + unified advisories', () => {
    const ctx = buildSelfDriveContext({
      tripId: 'trip-cn-g318',
      destination: 'CN',
      dayIndex: 1,
      classicRouteId: 'cn.route.g318',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      preferredDays: 14,
      metadata: {
        isSelfDrive: true,
        productLine: 'china_classic_self_drive',
        classicRouteId: 'cn.route.g318',
        drivingContext: {
          classicRouteId: 'cn.route.g318',
          wantsXizang: true,
          wantsSichuan: true,
          requiresAltitudeAcclimatization: true,
          checkpointLikely: true,
          etcRecommended: true,
          drivingThresholdPackCode: 'CN_XIZANG',
          cityLimitCities: ['成都'],
          seasonWindowIds: ['g318_rainy_season'],
          highSeveritySeasonHits: ['g318_rainy_season'],
          roadStatus: 'RESTRICTED',
          roadRiskLevel: 2,
          advisoriesCN: ['涉藏行程：安排高反适应'],
        },
        constraints: {
          drivingSegmentThresholds: {
            warnSegmentDistanceKm: 280,
            maxSegmentDistanceKm: 400,
          },
        },
      },
    });

    expect(ctx.schemaId).toBe(SELF_DRIVE_CONTEXT_SCHEMA);
    expect(ctx.countryCode).toBe('CN');
    expect(ctx.destinationPackId).toBe('destination.cn');
    expect(ctx.capabilities.capabilities.altitude_risk).toBe('SUPPORTED');
    expect(ctx.capabilities.capabilities.road_status).toBe('PARTIAL');
    expect(ctx.tripExecution.isSelfDrive).toBe(true);
    expect(ctx.route.corridorId).toBe('cn.route.g318');
    expect(ctx.route.segments.length).toBeGreaterThan(0);
    expect(ctx.route.criticalSegments.length).toBeGreaterThan(0);
    expect(ctx.advisories.some((a) => a.type === 'ALTITUDE')).toBe(true);
    expect(ctx.advisories.some((a) => a.type === 'CHECKPOINT')).toBe(true);
    expect(ctx.advisories.every((a) => !/China|Iceland|冰岛专用/i.test(a.type))).toBe(
      true,
    );
    expect(ctx.vehicle).toBeDefined();
    expect(ctx.profile.vehicle).toEqual(ctx.vehicle);
    expect(ctx.roadEvidence.length).toBeGreaterThan(0);
    expect(ctx.roadEvidence[0].freshness).toBe('PARTIAL');
    expect(ctx.roadEvidence[0].strongJudgmentAllowed).toBe(false);
    expect(ctx.evidence[0]?.degraded).toBe(true);
  });

  it('IS golden circle trip: isomorphic shape with CN', () => {
    const cn = buildSelfDriveContext({
      tripId: 'trip-cn',
      destination: 'CN',
      classicRouteId: 'cn.route.g318',
      dayIndex: 1,
      metadata: {
        isSelfDrive: true,
        classicRouteId: 'cn.route.g318',
        drivingContext: { classicRouteId: 'cn.route.g318', roadStatus: 'OPEN' },
      },
    });

    const is = buildSelfDriveContext({
      tripId: 'trip-is',
      destination: 'IS',
      classicRouteId: 'is.route.golden_circle',
      dayIndex: 1,
      metadata: {
        productLine: 'iceland_self_drive',
        classicRouteId: 'is.route.golden_circle',
        icelandSelfDrive: {
          productLine: 'iceland_self_drive',
          classicRouteId: 'is.route.golden_circle',
          routeStrategy: 'GOLDEN_CIRCLE',
        },
      },
    });

    const cnKeys = Object.keys(cn).sort();
    const isKeys = Object.keys(is).sort();
    expect(isKeys).toEqual(cnKeys);

    expect(is.schemaId).toBe(SELF_DRIVE_CONTEXT_SCHEMA);
    expect(is.countryCode).toBe('IS');
    expect(is.destinationPackId).toBe('destination.is');
    expect(is.capabilities.capabilities.road_status).toBe('SUPPORTED');
    expect(is.capabilities.capabilities.ferry).toBe('SUPPORTED');
    expect(is.route.corridorId).toBe('is.route.golden_circle');
    expect(is.route.segments.length).toBeGreaterThan(0);
    expect(is.tripExecution.isSelfDrive).toBe(true);
    // IS pack defaults include NO_F_ROAD → VEHICLE_FIT advisory
    expect(is.profile.rentalRestrictions?.some((r) => r.code === 'NO_F_ROAD')).toBe(
      true,
    );
  });

  it('resolves IS corridor from routeStrategy when classicRouteId absent', () => {
    const ctx = buildSelfDriveContext({
      tripId: 'trip-is-strategy',
      destination: 'Iceland',
      dayIndex: 1,
      metadata: {
        icelandSelfDrive: { routeStrategy: 'SOUTH_COAST' },
      },
    });
    expect(ctx.route.corridorId).toBe('is.route.ring_road_south');
  });
});
