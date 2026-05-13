import {
  buildResearchFinancialsFromHotelLiveRefresh,
  marginalUtilityProxyFromPrices,
} from './research-member-hotel-financials.util';

describe('marginalUtilityProxyFromPrices', () => {
  it('returns 0 for fewer than 2 prices', () => {
    expect(marginalUtilityProxyFromPrices([])).toBe(0);
    expect(marginalUtilityProxyFromPrices([100])).toBe(0);
  });

  it('returns clamped spread proxy for multiple prices', () => {
    const u = marginalUtilityProxyFromPrices([100, 200, 300, 400]);
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThanOrEqual(1);
  });
});

describe('buildResearchFinancialsFromHotelLiveRefresh', () => {
  it('uses median of hotel row prices and sets scope hotel', () => {
    const rd = {
      live_hotel_refresh: {
        result: {
          hotels: [{ price: 100 }, { price: 200 }, { price: 300 }],
        },
      },
    };
    const f = buildResearchFinancialsFromHotelLiveRefresh(rd);
    expect(f).toMatchObject({
      scope: 'hotel',
      estimated_cost: 200,
      marginal_utility: expect.any(Number),
    });
    expect(f!.marginal_utility).toBeGreaterThanOrEqual(0);
    expect(f!.marginal_utility).toBeLessThanOrEqual(1);
  });

  it('reads results array and string prices', () => {
    const rd = {
      live_hotel_refresh: {
        result: {
          results: [{ nightly_rate: '150' }, { nightly_rate: '250' }],
        },
      },
    };
    const f = buildResearchFinancialsFromHotelLiveRefresh(rd);
    expect(f?.estimated_cost).toBe(200);
  });

  it('returns undefined when no prices', () => {
    expect(buildResearchFinancialsFromHotelLiveRefresh({})).toBeUndefined();
    expect(
      buildResearchFinancialsFromHotelLiveRefresh({
        live_hotel_refresh: { result: { hotels: [{}] } },
      }),
    ).toBeUndefined();
  });
});
