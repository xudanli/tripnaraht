import {
  isChinaHotelSearchScope,
  lodgingTownAliasForAirbnb,
  resolveAirbnbSearchLocation,
} from './hotel-search-location.util';

describe('hotel-search-location.util', () => {
  it('prefers corridor place + country over Reykjavik capital fallback', () => {
    const loc = resolveAirbnbSearchLocation({
      countryCode: 'IS',
      countryName: 'Iceland',
      placeHint: '杰古沙龙冰河湖 lodging',
      countryCapitalFallback: 'Reykjavik, Iceland',
      latLngFallback: { lat: 64.1, lng: -16.2 },
    });
    // 冰河湖/杰古沙龙 → 宜住城镇 Höfn，避免漂到雷克雅未克
    expect(loc).toMatch(/Höfn/i);
    expect(loc).toContain('Iceland');
    expect(loc).not.toMatch(/^Reykjavik/);
  });

  it('falls back to capital when no place hint', () => {
    expect(
      resolveAirbnbSearchLocation({
        countryCode: 'IS',
        countryName: 'Iceland',
        countryCapitalFallback: 'Reykjavik, Iceland',
      }),
    ).toBe('Reykjavik, Iceland');
  });

  it('detects China scope for Amap lodging', () => {
    expect(isChinaHotelSearchScope({ countryCode: 'CN' })).toBe(true);
    expect(isChinaHotelSearchScope({ destination: '上海' })).toBe(true);
    expect(isChinaHotelSearchScope({ countryCode: 'IS', destination: 'Iceland' })).toBe(false);
  });

  it('maps Diamond Beach / 冰河湖 to Höfn for Airbnb lodging search', () => {
    expect(lodgingTownAliasForAirbnb('Diamond Beach')).toBe('Höfn');
    expect(lodgingTownAliasForAirbnb('钻石沙滩')).toBe('Höfn');
    expect(lodgingTownAliasForAirbnb('Jökulsárlón Glacier Lagoon')).toBe('Höfn');
  });

  it('uses lat/lng instead of Reykjavik when itinerary anchor exists without place text', () => {
    const loc = resolveAirbnbSearchLocation({
      countryCode: 'IS',
      countryName: 'Iceland',
      countryCapitalFallback: 'Reykjavik, Iceland',
      latLngFallback: { lat: 64.0438, lng: -16.1763 },
      preferLatLngOverCapital: true,
    });
    expect(loc).toContain('64.0438');
    expect(loc).not.toMatch(/Reykjavik/i);
  });

  it('aliases 钻石沙滩 placeHint to Höfn, Iceland', () => {
    const loc = resolveAirbnbSearchLocation({
      countryCode: 'IS',
      countryName: 'Iceland',
      placeHint: '钻石沙滩',
      countryCapitalFallback: 'Reykjavik, Iceland',
    });
    expect(loc).toMatch(/Höfn/i);
    expect(loc).not.toMatch(/Reykjavik/i);
  });

  it('rejects Day corridor synthetic placeHint; prefers itinerary English place', () => {
    const loc = resolveAirbnbSearchLocation({
      countryCode: 'IS',
      countryName: 'Iceland',
      placeHint: 'N1加油站（塞尔福斯乡村区）→塞里雅兰瀑布走廊 lodging',
      itineraryPlaceName: 'N1 Selfoss dreifbýli',
      countryCapitalFallback: 'Reykjavik, Iceland',
      latLngFallback: { lat: 63.96, lng: -20.15 },
      preferLatLngOverCapital: true,
    });
    expect(loc).toMatch(/Selfoss/i);
    expect(loc).toContain('Iceland');
    expect(loc).not.toMatch(/走廊|→/);
  });
});
