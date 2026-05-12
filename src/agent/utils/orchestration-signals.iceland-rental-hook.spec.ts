import { shouldInjectIcelandRentalGuidanceForLightweight } from './orchestration-signals.util';

describe('shouldInjectIcelandRentalGuidanceForLightweight', () => {
  it('matches 冰岛 + 租车话术', () => {
    expect(
      shouldInjectIcelandRentalGuidanceForLightweight('冰岛租车多少钱', ''),
    ).toBe(true);
  });

  it('matches trip IS context + 租车 without 冰岛 in message', () => {
    expect(
      shouldInjectIcelandRentalGuidanceForLightweight('推荐车行，全险', '目的地代码: IS\n开始日期: 2026-06-01'),
    ).toBe(true);
  });

  it('does not fire on unrelated 冰岛 weather only', () => {
    expect(shouldInjectIcelandRentalGuidanceForLightweight('冰岛明天天气', '')).toBe(false);
  });
});
