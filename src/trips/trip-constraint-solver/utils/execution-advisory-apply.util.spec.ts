import type { ExecutionRecommendationDto } from '../types/trip-constraint-solver.types';
import { resolveRecommendationMutation } from './execution-advisory-apply.util';

describe('execution-advisory-apply.util', () => {
  const shortenRec: ExecutionRecommendationDto = {
    id: 'rec-shorten-active',
    label: '缩短停留',
    description: '减少 30 分钟',
    actionType: 'shorten',
    isRecommended: true,
  };

  it('maps rec-shorten-active to active item', () => {
    const plan = resolveRecommendationMutation({
      recommendation: shortenRec,
      activeItemId: 'item-active',
      tripDayItemIds: ['item-1', 'item-active', 'item-3'],
    });
    expect(plan.action).toBe('shorten');
    expect(plan.itemId).toBe('item-active');
    expect(plan.deltaMinutes).toBe(-30);
  });

  it('maps skip recommendation to last item', () => {
    const plan = resolveRecommendationMutation({
      recommendation: {
        id: 'rec-skip-last',
        label: '跳过',
        description: '跳过最后一站',
        actionType: 'skip',
      },
      tripDayItemIds: ['item-1', 'item-2', 'item-3'],
    });
    expect(plan.action).toBe('skip');
    expect(plan.itemId).toBe('item-3');
  });

  it('returns keep for keep actionType', () => {
    const plan = resolveRecommendationMutation({
      recommendation: {
        id: 'rec-keep',
        label: '保持',
        description: '不变',
        actionType: 'keep',
      },
      tripDayItemIds: ['item-1'],
    });
    expect(plan.action).toBe('keep');
  });
});
