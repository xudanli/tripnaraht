import {
  detectRhythmOrDiningPlanningIntent,
  resolveSparsePoiDayAllocation,
} from './sparse-poi-day-allocation.util';

describe('sparse-poi-day-allocation.util', () => {
  it('detects dining / rhythm Chinese and English cues', () => {
    expect(detectRhythmOrDiningPlanningIntent('根据行程节奏推荐用餐区域')).toBe(true);
    expect(detectRhythmOrDiningPlanningIntent('where to eat along the route')).toBe(true);
    expect(detectRhythmOrDiningPlanningIntent('worth a stop for photos')).toBe(true);
    expect(detectRhythmOrDiningPlanningIntent('只去蓝湖温泉')).toBe(false);
  });

  it('resolveSparsePoiDayAllocation maps intent to allocation mode', () => {
    expect(resolveSparsePoiDayAllocation('推荐餐厅')).toBe('round_robin');
    expect(resolveSparsePoiDayAllocation('黄金圈一日游')).toBe('block');
  });
});
