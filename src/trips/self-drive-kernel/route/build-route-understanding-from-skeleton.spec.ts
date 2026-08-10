import { clearClassicDaySkeletonCache } from './load-classic-day-skeleton';
import { buildRouteUnderstandingFromSkeleton } from './build-route-understanding-from-skeleton';

describe('buildRouteUnderstandingFromSkeleton', () => {
  beforeEach(() => {
    clearClassicDaySkeletonCache();
  });

  it('CN qinggan day 5 is critical (long drive)', () => {
    const snap = buildRouteUnderstandingFromSkeleton({
      countryCode: 'CN',
      corridorId: 'cn.route.qinggan_loop',
      dayIndex: 5,
      preferredDays: 8,
      warnSegmentDistanceKm: 350,
    });

    expect(snap.variantId).toBe('8d');
    expect(snap.segments.length).toBeGreaterThan(0);
    expect(snap.criticalSegments.length).toBeGreaterThan(0);
    expect(
      snap.criticalSegments.some((s) => s.criticalReasons.includes('LONG_DAY')),
    ).toBe(true);
  });

  it('IS golden circle day 1 produces segment with corridor id', () => {
    const snap = buildRouteUnderstandingFromSkeleton({
      countryCode: 'IS',
      corridorId: 'is.route.golden_circle',
      dayIndex: 1,
      preferredDays: 1,
    });

    expect(snap.corridorId).toBe('is.route.golden_circle');
    expect(snap.originLabel).toBeTruthy();
    expect(snap.segments[0]?.segmentId).toMatch(/^seg:is\.route\.golden_circle:/);
  });
});
