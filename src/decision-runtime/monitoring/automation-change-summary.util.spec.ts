import {
  buildAutomationChangeSummary,
  estimateItemsChangedFromAction,
  resolveUndoActionId,
} from './automation-change-summary.util';

describe('automation-change-summary.util', () => {
  it('builds day-specific summary', () => {
    expect(
      buildAutomationChangeSummary({
        actionTitle: '道路关闭',
        affectedDayNumbers: [4],
        itemsChanged: 3,
      }),
    ).toBe('已根据道路关闭调整第 4 天，共修改 3 项，可撤销');
  });

  it('estimates items changed from action copy', () => {
    expect(
      estimateItemsChangedFromAction({ summary: '将移动 2 个可选景点' }),
    ).toBe(2);
  });

  it('resolves undo action from original candidate', () => {
    expect(
      resolveUndoActionId({ availableActionIds: ['cand_a', 'original', 'cand_b'] }),
    ).toBe('original');
  });
});
