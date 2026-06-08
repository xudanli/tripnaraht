import { resolvePoiIntentProfile } from '../utils/itinerary-item-add-intent.util';
import { buildSupplyGapFailureGuidance } from './intent-supply-failure.util';

describe('intent-supply-failure.util', () => {
  it('builds iceland sparse supply guidance', () => {
    const profile = resolvePoiIntentProfile('购买水果')!;
    const text = buildSupplyGapFailureGuidance(profile, {
      dayNumber: 1,
      searchRadiusKm: 35,
      countryCode: 'IS',
    });
    expect(text).toMatch(/第1天/);
    expect(text).toMatch(/35km|补给稀疏|Selfoss|Vík/i);
  });
});
