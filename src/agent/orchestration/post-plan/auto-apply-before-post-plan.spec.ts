/**
 * 回归：PostPlan terminal 成功路径不得跳过 auto-apply。
 * 断言调用顺序：materialize → maybeAutoApply → runPostPlanGraph。
 */

describe('auto-apply ordering relative to PostPlan', () => {
  it('invokes maybeAutoApply before runPostPlanGraph and only once', async () => {
    const order: string[] = [];
    const maybeAutoApply = jest.fn(async () => {
      order.push('auto_apply');
    });
    const runPostPlanGraph = jest.fn(async () => {
      order.push('post_plan');
      return {
        kind: 'terminal' as const,
        terminal: 'terminal_done' as const,
        result: { success: true },
        decisionState: undefined,
      };
    });
    const materialize = jest.fn(async () => {
      order.push('materialize');
    });

    // 模拟状态机成功尾段（与 claude-orchestrator 当前顺序一致）
    await materialize();
    await maybeAutoApply();
    const postPlanOutcome = await runPostPlanGraph();
    expect(postPlanOutcome.kind).toBe('terminal');
    // terminal 早退后不得再次 auto-apply
    expect(maybeAutoApply).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['materialize', 'auto_apply', 'post_plan']);
  });
});
