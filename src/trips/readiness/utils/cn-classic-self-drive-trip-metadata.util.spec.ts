import {
  CHINA_CLASSIC_SELF_DRIVE_PRODUCT_LINE,
  enrichCnClassicSelfDriveTripMetadata,
} from './cn-classic-self-drive-trip-metadata.util';

describe('cn-classic-self-drive-trip-metadata.util', () => {
  it('seeds G318 trip as self-drive with Xizang segment thresholds', () => {
    const metadata: Record<string, unknown> = {};
    enrichCnClassicSelfDriveTripMetadata({
      destination: 'CN',
      metadata,
      classicRouteId: 'cn.route.g318',
      transport: 'car',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
    });
    expect(metadata.isSelfDrive).toBe(true);
    expect(metadata.travelMode).toBe('self_drive');
    expect(metadata.productLine).toBe(CHINA_CLASSIC_SELF_DRIVE_PRODUCT_LINE);
    expect(metadata.classicRouteId).toBe('cn.route.g318');
    expect(metadata.constraints).toEqual({
      maxSegmentDistanceKm: 250,
      warnSegmentDistanceKm: 160,
    });
    const drivingContext = metadata.drivingContext as Record<string, unknown>;
    expect(drivingContext.wantsXizang).toBe(true);
    expect(drivingContext.drivingThresholdPackCode).toBe('CN_XIZANG');
    expect(drivingContext.highSeveritySeasonHits).toEqual(
      expect.arrayContaining(['g318_rainy_season']),
    );
  });

  it('seeds Qinggan with national CN thresholds', () => {
    const metadata: Record<string, unknown> = { classicRouteId: 'cn.route.qinggan_loop' };
    enrichCnClassicSelfDriveTripMetadata({
      destination: 'CN',
      metadata,
      transport: 'car',
    });
    expect(metadata.constraints).toEqual({
      maxSegmentDistanceKm: 350,
      warnSegmentDistanceKm: 220,
    });
  });

  it('does not overwrite user maxSegmentDistanceKm', () => {
    const metadata: Record<string, unknown> = {
      constraints: { maxSegmentDistanceKm: 400 },
    };
    enrichCnClassicSelfDriveTripMetadata({
      destination: 'CN',
      metadata,
      classicRouteId: 'cn.route.g318',
    });
    expect(metadata.constraints).toEqual({ maxSegmentDistanceKm: 400 });
  });
});
