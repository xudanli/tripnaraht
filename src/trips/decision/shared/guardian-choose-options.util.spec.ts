import {
  enrichOptimizeResultChooseFields,
  flattenChooseOptionPoints,
} from './guardian-choose-options.util';
import type { StrategyOrchestrationResultV2 } from '../optimization/strategy-orchestrator-v2.service';

function baseResult(
  overrides: Partial<StrategyOrchestrationResultV2> = {},
): StrategyOrchestrationResultV2 {
  return {
    plan: null,
    allowed: true,
    finalAction: 'ALLOW',
    logs: [],
    objectiveEvaluation: {} as StrategyOrchestrationResultV2['objectiveEvaluation'],
    abuResult: {} as StrategyOrchestrationResultV2['abuResult'],
    dreResult: {} as StrategyOrchestrationResultV2['dreResult'],
    summary: {
      originalUtility: 0,
      finalUtility: 0,
      improvementPct: 0,
      safetyScore: 0,
      constraintSatisfaction: 0,
      confidence: 0,
    },
    ...overrides,
  };
}

describe('flattenChooseOptionPoints', () => {
  it('flattens options preferentially', () => {
    expect(
      flattenChooseOptionPoints([
        {
          id: 'A',
          question: '是否接受风险？',
          options: ['接受', '调整'],
          recommendation: '调整',
        },
      ]),
    ).toEqual(['接受', '调整']);
  });

  it('falls back to question when no options', () => {
    expect(
      flattenChooseOptionPoints([{ id: 'B', question: '确认继续？', options: [] }]),
    ).toEqual(['确认继续？']);
  });
});

describe('enrichOptimizeResultChooseFields', () => {
  it('sets chooseRequired when judgment points exist', () => {
    const enriched = enrichOptimizeResultChooseFields(
      baseResult({
        userJudgmentPoints: [
          {
            id: 'PACING',
            question: '增加休息日？',
            options: ['接受', '保持原样'],
            recommendation: '接受',
          },
        ],
      }),
    );
    expect(enriched.chooseRequired).toBe(true);
    expect(enriched.humanDecisionPointsFlat).toEqual(['接受', '保持原样']);
    expect(enriched.hardConstraintBlocked).toBeUndefined();
  });

  it('blocks CHOOSE on REJECT', () => {
    const enriched = enrichOptimizeResultChooseFields(
      baseResult({
        allowed: false,
        finalAction: 'REJECT',
        userJudgmentPoints: [
          {
            id: 'X',
            question: 'ignored',
            options: ['a'],
            recommendation: 'a',
          },
        ],
      }),
    );
    expect(enriched.hardConstraintBlocked).toBe(true);
    expect(enriched.humanDecisionPointsFlat).toBeUndefined();
    expect(enriched.chooseRequired).toBeUndefined();
  });
});
