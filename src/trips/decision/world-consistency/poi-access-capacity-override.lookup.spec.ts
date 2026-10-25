import { PoiAccessCapacityOverrideLookup } from './poi-access-capacity-override.lookup';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';

describe('PoiAccessCapacityOverrideLookup', () => {
  it('prefers ACTIVE CLOSED over other ACTIVE rules', async () => {
    const closed: PoiAccessStatusOverride = {
      id: 'ov_c',
      poiId: 'is.skaftafell',
      ruleType: 'CLOSED',
      targetResource: 'POI',
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      status: 'ACTIVE',
      sourceAuthority: 'vatnajokull_trail_status',
      lastVerifiedAt: new Date().toISOString(),
      confidence: 'OFFICIAL',
    };
    const window: PoiAccessStatusOverride = {
      ...closed,
      id: 'ov_w',
      ruleType: 'TIME_WINDOW',
    };
    const capacity = {
      getStatusOverridesForPoiSlugs: jest.fn(async () => [window, closed]),
    };
    const lookup = new PoiAccessCapacityOverrideLookup(capacity as never);
    const got = await lookup.findActiveOverride('is.skaftafell');
    expect(got?.id).toBe('ov_c');
  });

  it('returns null when capacity service missing', async () => {
    const lookup = new PoiAccessCapacityOverrideLookup(undefined);
    expect(await lookup.findActiveOverride('is.skaftafell')).toBeNull();
  });
});
