import {
  lookupCnCityDrivingLimit,
  listCnCityDrivingLimits,
  cnCityDrivingLimitDisclaimer,
} from './cn-city-driving-limits.util';

describe('cn-city-driving-limits.util', () => {
  it('lists seeded major cities', () => {
    const all = listCnCityDrivingLimits();
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.some((c) => c.cityCN === '北京')).toBe(true);
  });

  it('looks up by Chinese or English name', () => {
    expect(lookupCnCityDrivingLimit('上海')?.limitType).toBeTruthy();
    expect(lookupCnCityDrivingLimit('Beijing')?.cityCN).toBe('北京');
  });

  it('exposes disclaimer', () => {
    expect(cnCityDrivingLimitDisclaimer()).toMatch(/交管|通告/);
  });
});
