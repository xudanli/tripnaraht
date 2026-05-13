import {
  shouldInjectIcelandRentalGuidanceForLightweight,
  shouldPullSafetravelAdvisoriesForLightweightIceland,
} from './orchestration-signals.util';

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

describe('shouldPullSafetravelAdvisoriesForLightweightIceland', () => {
  it('pulls when trip summary anchors IS', () => {
    expect(
      shouldPullSafetravelAdvisoriesForLightweightIceland({
        message: '有什么要注意的',
        tripContextJoined: '目的地代码: IS\n开始日期: 2026-06-01',
        hasAnchoredTripFact: true,
        weatherRoadFocused: false,
      }),
    ).toBe(true);
  });

  it('pulls on explicit SafeTravel / 红警 query', () => {
    expect(
      shouldPullSafetravelAdvisoriesForLightweightIceland({
        message: 'safetravel 红警什么意思',
        tripContextJoined: '',
        hasAnchoredTripFact: false,
        weatherRoadFocused: false,
      }),
    ).toBe(true);
  });

  it('does not pull on generic 冰岛几月好 without IS anchor or driving intent', () => {
    expect(
      shouldPullSafetravelAdvisoriesForLightweightIceland({
        message: '冰岛几月份去比较好',
        tripContextJoined: '',
        hasAnchoredTripFact: false,
        weatherRoadFocused: false,
      }),
    ).toBe(false);
  });
});
