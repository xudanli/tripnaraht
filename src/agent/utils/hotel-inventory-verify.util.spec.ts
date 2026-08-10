import {
  listingHasStayPriceHint,
  preferStayPricedAirbnbListings,
  stampPoiCatalogInventory,
} from './hotel-inventory-verify.util';

describe('hotel-inventory-verify.util', () => {
  it('detects stay price hint from structuredDisplayPrice', () => {
    expect(
      listingHasStayPriceHint({
        structuredDisplayPrice: { primaryLine: { accessibilityLabel: '$120 total' } },
      }),
    ).toBe(true);
    expect(listingHasStayPriceHint({ id: '1', name: 'Cabin' })).toBe(false);
  });

  it('prefers priced listings when stay dates exist', () => {
    const rows = [
      { id: 'a' },
      { id: 'b', structuredDisplayPrice: { primaryLine: { accessibilityLabel: '$90' } } },
      { id: 'c', structuredDisplayPrice: { primaryLine: { accessibilityLabel: '$110' } } },
      { id: 'd', structuredDisplayPrice: { primaryLine: { accessibilityLabel: '$95' } } },
    ];
    const prefer = preferStayPricedAirbnbListings(rows, true);
    expect(prefer.map((r) => r.id)).toEqual(['b', 'c', 'd']);
  });

  it('stamps poi catalog as unverified inventory', () => {
    const stamped = stampPoiCatalogInventory([{ placeId: 'x', name: 'Hotel' }], 'hotel');
    expect(stamped.inventory_meta.inventory_verified).toBe(false);
    expect(stamped.inventory_meta.inventory_mode).toBe('poi_catalog');
    expect(stamped.results[0].inventoryVerified).toBe(false);
  });

  it('attaches 携程/飞猪/去哪儿 jump urls for amap hotels', () => {
    const stamped = stampPoiCatalogInventory(
      [{ placeId: 'amap-1', name: '成都宽窄巷子酒店', address: '成都市' }],
      'amap',
    );
    expect(stamped.results[0].url).toContain('ctrip.com');
    expect(stamped.results[0].bookingProvider).toBe('ctrip');
    expect(
      (stamped.results[0].bookingLinks as Array<{ provider: string }>).map(
        (l) => l.provider,
      ),
    ).toEqual(['ctrip', 'fliggy', 'qunar']);
  });
});

