import {
  composeCollaborativeSubTaskDisplayDescription,
  composeCollaborativeSubTaskDisplayTitle,
} from './decision-collaborative-subtask-display.util';

describe('decision-collaborative-subtask-display.util', () => {
  it('prefixes generic team confirm with problem title', () => {
    expect(
      composeCollaborativeSubTaskDisplayTitle(
        '团队确认决策结果',
        '第3天 · 斯科加瀑布午餐推迟',
      ),
    ).toBe('第3天 · 斯科加瀑布午餐推迟 · 团队确认');
  });

  it('keeps custom sub-task title with problem prefix', () => {
    expect(
      composeCollaborativeSubTaskDisplayTitle('查取消政策', '蓝湖温泉预约'),
    ).toBe('蓝湖温泉预约 · 查取消政策');
  });

  it('returns sub-task title when problem title missing', () => {
    expect(composeCollaborativeSubTaskDisplayTitle('团队确认决策结果')).toBe(
      '团队确认决策结果',
    );
  });

  it('does not duplicate when sub-task already contains problem title', () => {
    expect(
      composeCollaborativeSubTaskDisplayTitle(
        '斯科加瀑布 · 团队确认',
        '斯科加瀑布',
      ),
    ).toBe('斯科加瀑布 · 团队确认');
  });

  it('builds description fallback from problem title', () => {
    expect(
      composeCollaborativeSubTaskDisplayDescription(undefined, '午餐窗口冲突'),
    ).toBe('跟进决策：午餐窗口冲突');
  });
});
