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

  it('ring-road / Route 1 intent forces block (not round_robin)', () => {
    expect(resolveSparsePoiDayAllocation('7天冰岛一号公路环岛自驾')).toBe('block');
    expect(resolveSparsePoiDayAllocation('ring road marathon')).toBe('block');
  });

  it('sparse polar destination / country maps to intentional_slack', () => {
    expect(resolveSparsePoiDayAllocation('想去看看', undefined, { countryCode: 'GL' })).toBe(
      'intentional_slack',
    );
    expect(
      resolveSparsePoiDayAllocation('自驾', undefined, { destinationHint: 'Longyearbyen' }),
    ).toBe('intentional_slack');
  });

  it('forced allocation wins over text heuristics', () => {
    expect(resolveSparsePoiDayAllocation('推荐餐厅', 'block')).toBe('block');
    expect(resolveSparsePoiDayAllocation('环岛', 'intentional_slack')).toBe('intentional_slack');
  });
});
