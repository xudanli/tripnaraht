import {
  buildSuggestedPillsFromCards,
  buildTransitionFromRound,
} from './clarification-transition.builder';

describe('clarification-transition.builder', () => {
  it('buildTransitionFromRound lists DSL titles only', () => {
    const text = buildTransitionFromRound(
      { name: '风格选择' },
      [{ question: '你计划什么时候来冰岛？*' }, { question: '你最感兴趣的活动是什么？' }],
    );
    expect(text).toContain('进入「风格选择」阶段');
    expect(text).toContain('你计划什么时候来冰岛？');
    expect(text).toContain('卡片为准');
    expect(text).not.toMatch(/^\d+\./m);
  });

  it('buildSuggestedPillsFromCards mirrors card stems', () => {
    const pills = buildSuggestedPillsFromCards([
      { question: '你和谁一起旅行？*' },
      { question: '你的风险承受度是什么？' },
    ]);
    expect(pills).toEqual(['你和谁一起旅行？', '你的风险承受度是什么？']);
  });
});
