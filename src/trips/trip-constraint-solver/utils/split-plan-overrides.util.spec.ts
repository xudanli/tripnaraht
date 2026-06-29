import type { DecisionCheckerSplitPlanDto } from '../types/decision-checker.types';
import type { PlanningDaySplitDto } from '../types/planning-conflicts.types';
import { mergeSplitPlanProjection, patchSplitPlanOverrides } from './split-plan-overrides.util';

describe('split-plan-overrides.util', () => {
  const baseBundle = {
    splitPlan: {
      id: 'split_d3_glacier',
      kind: 'physical_strength',
      banner: { title: 't', message: 'm', affectedDays: [3] },
      recommendation: { title: 'r', summary: 's' },
      metrics: [],
      groups: [
        {
          id: 'grp_a',
          label: 'A组 · 冰川徒步',
          memberCount: 2,
          activityTitle: '高强度体验',
          highlights: [],
        },
      ],
      logistics: {
        meetupPoint: '原汇合点',
        meetupTime: '13:30',
        emergencyContact: '+354 112',
      },
      actions: [],
    } as DecisionCheckerSplitPlanDto,
    daySplits: [
      {
        id: 'ds-1',
        splitPlanId: 'split_d3_glacier',
        dayIndex: 2,
        dayNumber: 3,
        title: 'Day 3 分流',
        sharedBefore: [],
        branches: [],
        stats: { meetupTime: '13:30' },
        rejoin: { id: 'r1', kind: 'rejoin', startTime: '13:30', title: '汇合', placeName: '原汇合点' },
      } as PlanningDaySplitDto,
    ],
  };

  it('mergeSplitPlanProjection applies logistics and group overrides', () => {
    const merged = mergeSplitPlanProjection(baseBundle, {
      logistics: { meetupPoint: '瓦特纳冰川停车场', transport: '超级吉普' },
      groups: [{ id: 'grp_a', label: 'A组 · 更新标签' }],
      emergencyNote: '天气变化时联系向导',
    });

    expect(merged.splitPlan.logistics.meetupPoint).toBe('瓦特纳冰川停车场');
    expect(merged.splitPlan.groups[0]?.label).toBe('A组 · 更新标签');
    expect(merged.splitPlan.risks?.[0]?.description).toContain('天气变化');
    expect(merged.daySplits[0]?.rejoin?.placeName).toBe('原汇合点');
  });

  it('patchSplitPlanOverrides merges nested fields', () => {
    const next = patchSplitPlanOverrides(
      { logistics: { meetupTime: '12:00' } },
      { logistics: { meetupPoint: '新地点' }, emergencyNote: 'note' },
      'user-1',
    );
    expect(next.logistics?.meetupTime).toBe('12:00');
    expect(next.logistics?.meetupPoint).toBe('新地点');
    expect(next.updatedBy).toBe('user-1');
  });
});
