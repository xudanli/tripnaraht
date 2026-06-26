import {
  buildPlanningPhaseTripOverviewPromptLines,
  isAgentTripComprehensiveAnalysisMessage,
  parseTripStartDateFromContextLines,
  shouldSkipAgentReadinessPackCheck,
} from './agent-readiness-phase.util';

describe('isAgentTripComprehensiveAnalysisMessage', () => {
  it('匹配用户常见全面分析话术', () => {
    expect(
      isAgentTripComprehensiveAnalysisMessage(
        '帮我全面分析当前行程，看看还有什么问题或可以优化的地方',
      ),
    ).toBe(true);
  });
});

describe('shouldSkipAgentReadinessPackCheck', () => {
  it('planning_workbench 入口跳过 Readiness Pack', () => {
    expect(
      shouldSkipAgentReadinessPackCheck({
        options: { entry_point: 'planning_workbench' },
      }),
    ).toBe(true);
  });

  it('active_trip_summary 上下文跳过 Readiness Pack', () => {
    expect(
      shouldSkipAgentReadinessPackCheck({
        options: {},
        conversation_context: { context_type: 'active_trip_summary' },
        trip_id: 't1',
      }),
    ).toBe(true);
  });

  it('绑定 trip + 全面分析话术跳过 Readiness Pack', () => {
    expect(
      shouldSkipAgentReadinessPackCheck(
        { options: {}, trip_id: 't1' },
        undefined,
        '帮我全面分析当前行程',
      ),
    ).toBe(true);
  });

  it('TRIP_PLANNING intent 跳过 Readiness Pack', () => {
    expect(
      shouldSkipAgentReadinessPackCheck({
        options: { intent_mode: 'TRIP_PLANNING' },
      }),
    ).toBe(true);
  });

  it('距出发 >14 天（readiness phase=planning）跳过', () => {
    const far = new Date();
    far.setDate(far.getDate() + 60);
    expect(shouldSkipAgentReadinessPackCheck({ options: {} }, far)).toBe(true);
  });

  it('临行前窗口、无规划上下文、非分析话术时不跳过', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    expect(
      shouldSkipAgentReadinessPackCheck(
        { options: { entry_point: 'trip_detail_page' }, trip_id: 't1' },
        soon,
        '冰岛签证要多久',
      ),
    ).toBe(false);
  });
});

describe('parseTripStartDateFromContextLines', () => {
  it('解析开始日期行', () => {
    const d = parseTripStartDateFromContextLines(['开始日期: 2026-08-01', '其他']);
    expect(d?.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('解析开始: 行', () => {
    const d = parseTripStartDateFromContextLines(['开始: 2026-08-01']);
    expect(d?.toISOString().slice(0, 10)).toBe('2026-08-01');
  });
});

describe('buildPlanningPhaseTripOverviewPromptLines', () => {
  it('强调打包与日程而非 Pack blockers', () => {
    const joined = buildPlanningPhaseTripOverviewPromptLines().join('\n');
    expect(joined).toContain('打包');
    expect(joined).toContain('blockers/must 计数');
  });
});
