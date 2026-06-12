import {
  isPlausibleIcelandPoiCoord,
  resolveEffectiveIcelandPlaceCoordinates,
} from './iceland-canonical-poi-coords.util';

describe('iceland-canonical-poi-coords', () => {
  it('detects Sheffield coords as off-Iceland', () => {
    expect(isPlausibleIcelandPoiCoord(53.3838382, -1.464519)).toBe(false);
    expect(isPlausibleIcelandPoiCoord(64.255, -21.129)).toBe(true);
  });

  it('corrects Place 381037 (Thingvellir) when bound to UK coords', () => {
    const resolved = resolveEffectiveIcelandPlaceCoordinates({
      id: 381037,
      nameEN: 'Rules',
      nameCN: '辛格维利尔国家公园',
      lat: 53.3838382,
      lng: -1.464519,
      metadata: { name_is: 'Þingvellir', region: 'Golden Circle' },
    });
    expect(resolved?.corrected).toBe(true);
    expect(resolved?.lat).toBeCloseTo(64.255, 2);
    expect(resolved?.lng).toBeCloseTo(-21.129, 2);
  });

  it('keeps valid Iceland coords unchanged', () => {
    const resolved = resolveEffectiveIcelandPlaceCoordinates({
      id: 381080,
      nameEN: 'Seljalandsfoss',
      lat: 63.6185,
      lng: -19.9965,
    });
    expect(resolved?.corrected).toBe(false);
  });
});
