import { IcelandSelfDriveRouteSkeletonService } from './iceland-self-drive-route-skeleton.service';

describe('IcelandSelfDriveRouteSkeletonService', () => {
  const svc = new IcelandSelfDriveRouteSkeletonService();

  it('maps region ids to exploration template tokens', () => {
    expect(svc.mapToTemplateRegions(['south_coast', 'golden_circle', 'highlands'])).toEqual([
      'SOUTH_COAST',
      'GOLDEN_CIRCLE',
      'HIGHLANDS',
    ]);
  });

  it('picks strategy by region set', () => {
    expect(svc.pickStrategyId(['highlands'])).toBe('remote-highlands-south');
    expect(svc.pickStrategyId(['ring_road'])).toBe('coverage-ring-compressed');
    expect(svc.pickStrategyId(['south_coast', 'golden_circle'])).toBe(
      'depth-south-coast',
    );
    expect(svc.pickStrategyId([])).toBe('depth-south-coast');
  });

  it('builds day corridor + overnight hints and region summary', () => {
    const { skeleton, warnings } = svc.build({
      startDate: '2027-02-10',
      endDate: '2027-02-12',
      regionIds: ['south_coast', 'golden_circle'],
    });
    expect(skeleton.strategyId).toBe('depth-south-coast');
    expect(skeleton.regionSummary).toBe('南岸 + 黄金圈');
    expect(skeleton.days).toHaveLength(3);
    expect(skeleton.days[0]?.corridorLabel).toBe('南岸');
    expect(skeleton.days[2]?.overnightHint).toContain('返程');
    expect(warnings).toHaveLength(0);
  });

  it('emits REGION_TIGHTNESS for ambitious winter itineraries', () => {
    const { warnings } = svc.build({
      startDate: '2027-02-10',
      endDate: '2027-02-15',
      regionIds: [
        'south_coast',
        'golden_circle',
        'snaefellsnes',
        'ring_road',
        'highlands',
      ],
    });
    expect(warnings.some((w) => w.code === 'REGION_TIGHTNESS')).toBe(true);
  });
});
