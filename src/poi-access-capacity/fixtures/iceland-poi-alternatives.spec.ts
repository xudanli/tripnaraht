import { appendAlternativePlanB, getPrimaryAlternative } from '../fixtures/iceland-poi-alternatives';

describe('iceland-poi-alternatives', () => {
  it('getPrimaryAlternative 返回首选替代', () => {
    const alt = getPrimaryAlternative('is.blue_lagoon');
    expect(alt?.poiId).toBe('is.sky_lagoon');
  });

  it('appendAlternativePlanB 不重复添加', () => {
    const planB = appendAlternativePlanB('is.dyrholaey', []);
    expect(planB).toHaveLength(1);
    expect(planB[0].alternativePoiId).toBe('is.reynisfjara');

    const again = appendAlternativePlanB('is.dyrholaey', planB);
    expect(again).toHaveLength(1);
  });
});
