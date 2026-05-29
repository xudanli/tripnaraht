import {
  buildDefaultPermitsForRoute,
  normalizeHikingDetailPermits,
} from './hiking-detail-permits.util';

describe('hiking-detail-permits.util', () => {
  it('normalizeHikingDetailPermits fills nameCN from titleZh', () => {
    const rows = normalizeHikingDetailPermits([
      {
        id: 'fi-hut',
        titleZh: 'FÍ 山屋预订',
        required: true,
        bookingUrl: 'https://www.fi.is',
      },
    ]);
    expect(rows[0]).toMatchObject({
      id: 'fi-hut',
      nameCN: 'FÍ 山屋预订',
      titleZh: 'FÍ 山屋预订',
      required: true,
      bookingUrl: 'https://www.fi.is',
    });
  });

  it('buildDefaultPermitsForRoute returns named IS permits', () => {
    const rows = buildDefaultPermitsForRoute({
      name: 'IS_TREKKING_WILDERNESS',
      nameCN: '荒野徒步',
      countryCode: 'IS',
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].nameCN).toBeTruthy();
    expect(rows.every((p) => p.id && p.nameCN)).toBe(true);
  });
});
