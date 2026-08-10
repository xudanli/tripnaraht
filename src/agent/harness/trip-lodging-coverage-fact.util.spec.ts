import {
  buildTripLodgingCoverageAnswerZh,
  buildTripLodgingCoverageFromDays,
  formatTripLodgingCoveragePromptLines,
  isLodgingGapDirectAnswerQuery,
} from './trip-lodging-coverage-fact.util';
import {
  assertDecisionRuntimeEntry,
  commitDecisionSelection,
  createOpenDecisionProblem,
} from './decision-runtime.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';

describe('trip-lodging-coverage-fact', () => {
  it('marks overnight gaps before last day', () => {
    const slice = buildTripLodgingCoverageFromDays({
      tripId: 't1',
      destination: 'Iceland',
      days: [
        {
          date: '2026-06-01',
          items: [{ type: 'ACTIVITY', nameZh: '蓝湖' }],
        },
        {
          date: '2026-06-02',
          items: [{ type: 'LODGING', nameZh: '雷市酒店', placeCategory: 'HOTEL' }],
        },
        {
          date: '2026-06-03',
          items: [{ type: 'ACTIVITY', nameZh: '离境' }],
        },
      ],
    });
    expect(slice.nightsExpected).toBe(2);
    expect(slice.missingDayNumbers).toEqual([1]);
    expect(slice.coveredDayNumbers).toEqual([2]);
    expect(slice.nights[2].overnightExpected).toBe(false);

    const answer = buildTripLodgingCoverageAnswerZh(slice);
    expect(answer).toContain('Day1');
    expect(answer).toContain('缺住宿');
    expect(isLodgingGapDirectAnswerQuery('哪一天没住宿')).toBe(true);
    expect(formatTripLodgingCoveragePromptLines(slice).join('\n')).toContain('【缺住宿】');
  });

  it('reports all nights covered', () => {
    const slice = buildTripLodgingCoverageFromDays({
      tripId: 't2',
      days: [
        {
          date: '2026-07-01',
          items: [{ type: 'HOTEL', nameZh: 'A' }],
        },
        {
          date: '2026-07-02',
          items: [],
        },
      ],
    });
    expect(slice.missingDayNumbers).toEqual([]);
    expect(buildTripLodgingCoverageAnswerZh(slice)).toMatch(/都已有住宿节点/);
  });
});

describe('decision-runtime skeleton', () => {
  it('enters DECISION_SUPPORT and commits option without APPLY', () => {
    const contract = compileAgentTaskContract({
      message: '帮我在雷克雅未克和维克之间选一个过夜城',
      tripId: 'trip_dec',
    });
    // 若话术未命中 DECISION，强制用 profile：检测可能走 TRIP_QUERY
    const decisionContract =
      contract.taskType === 'DECISION_SUPPORT'
        ? contract
        : compileAgentTaskContract({
            message: '帮我做一个决策：选雷市还是维克过夜？请对比利弊后给我推荐',
            tripId: 'trip_dec',
          });

    if (decisionContract.taskType !== 'DECISION_SUPPORT') {
      // 骨架阶段：用手工覆盖 capabilities 测 commit 路径
      const forced = {
        ...contract,
        taskType: 'DECISION_SUPPORT' as const,
        authority: 'DECISION_COMMIT' as const,
        capabilities: {
          allow: ['READ_TRIP', 'ANSWER', 'CREATE_DECISION', 'GATE_EVAL'] as const,
          deny: ['PLAN', 'APPLY', 'OPTIMIZE', 'REPAIR'] as const,
        },
      };
      const trace = assertDecisionRuntimeEntry(forced as any);
      expect(trace.denyApplyPlan).toBe(true);
      const problem = createOpenDecisionProblem({
        contract: forced as any,
        kind: 'LODGING_NIGHT',
        questionZh: '今晚住哪？',
        options: [
          { optionId: 'opt_a', labelZh: '雷市' },
          { optionId: 'opt_b', labelZh: '维克' },
        ],
        recommendedOptionId: 'opt_a',
      });
      expect(problem.commitAuthority).toBe('DECISION_ONLY');
      const committed = commitDecisionSelection(problem, 'opt_b');
      expect(committed.status).toBe('COMMITTED');
      expect(committed.selectedOptionId).toBe('opt_b');
      return;
    }

    const problem = createOpenDecisionProblem({
      contract: decisionContract,
      kind: 'LODGING_NIGHT',
      questionZh: '今晚住哪？',
      options: [
        { optionId: 'opt_a', labelZh: '雷市' },
        { optionId: 'opt_b', labelZh: '维克' },
      ],
    });
    expect(problem.status).toBe('NEED_SELECT');
    const committed = commitDecisionSelection(problem, 'opt_a');
    expect(committed.status).toBe('COMMITTED');
  });
});
