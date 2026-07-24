import { isPoiSupplyConsultationQuery } from './trip-supply-consultation.util';

describe('trip-supply-consultation.util', () => {
  it('detects what fruits can be bought at a named supermarket', () => {
    expect(isPoiSupplyConsultationQuery('维克超市可以买到什么水果')).toBe(true);
  });

  it('detects generic supply questions', () => {
    expect(isPoiSupplyConsultationQuery('冰岛超市有什么水果')).toBe(true);
    expect(isPoiSupplyConsultationQuery('附近能买苹果的超市吗')).toBe(true);
    expect(isPoiSupplyConsultationQuery('What fruits can I buy at Bonus?')).toBe(true);
  });

  it('does not treat itinerary edit as supply consultation', () => {
    expect(isPoiSupplyConsultationQuery('第一天我想新增一个可以购买水果的poi')).toBe(false);
  });
});
