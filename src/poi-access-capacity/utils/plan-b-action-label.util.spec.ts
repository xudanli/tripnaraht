import { planBActionLabelZh } from './plan-b-action-label.util';

describe('planBActionLabelZh', () => {
  it('maps POI access planB action keys to Chinese labels', () => {
    expect(planBActionLabelZh('SHIFT_ARRIVAL')).toBe('改到达时刻');
    expect(planBActionLabelZh('USE_ALTERNATIVE')).toBe('替代 POI');
  });

  it('falls back to detail when action is unknown', () => {
    expect(planBActionLabelZh('UNKNOWN', '关注 SafeTravel.is 公告')).toBe(
      '关注 SafeTravel.is 公告',
    );
  });
});
