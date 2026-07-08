import {
  isCanonicalTravelPoiId,
  resolveCanonicalPoiIdSync,
} from '../utils/resolve-poi-id-sync.util';

describe('resolve-poi-id-sync.util', () => {
  it('resolves 蓝湖 to is.blue_lagoon', () => {
    const r = resolveCanonicalPoiIdSync({ name: '蓝湖', countryCode: 'IS' });
    expect(r.status).toBe('MATCHED');
    expect(r.poiId).toBe('is.blue_lagoon');
  });

  it('isCanonicalTravelPoiId accepts is.* slugs', () => {
    expect(isCanonicalTravelPoiId('is.blue_lagoon')).toBe(true);
    expect(isCanonicalTravelPoiId('Blue Lagoon')).toBe(false);
  });
});
