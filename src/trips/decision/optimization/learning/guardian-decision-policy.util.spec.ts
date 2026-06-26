import {
  buildHardConstraintVetoSummary,
  countHardViolations,
  resolveHardConstraintVeto,
} from './guardian-decision-policy.util';
import type { PersonaEvaluation } from './guardian-persona.interface';
import type { ObjectiveEvaluationResult } from '../objective-function.interface';

function baseEval(hardCount: number): ObjectiveEvaluationResult {
  return {
    totalUtility: 0.5,
    breakdown: {} as ObjectiveEvaluationResult['breakdown'],
    constraints: {
      hardViolations: Array.from({ length: hardCount }, (_, i) => ({
        constraintId: `HC_${i}`,
        violationDegree: 1,
        violationExplanation: 'blocked',
      })),
      softViolations: [],
    },
  } as ObjectiveEvaluationResult;
}

const abuHardBlock: PersonaEvaluation = {
  persona: 'ABU',
  utility: 0.2,
  primaryConcerns: ['存在 1 个硬约束违反'],
  positiveAspects: [],
  suggestedAdjustments: [],
  stance: 'STRONG_OPPOSE',
  confidence: 0.9,
  reasoning: '不可执行',
};

const dreSupport: PersonaEvaluation = {
  persona: 'DRE',
  utility: 0.8,
  primaryConcerns: [],
  positiveAspects: [],
  suggestedAdjustments: [],
  stance: 'SUPPORT',
  confidence: 0.8,
  reasoning: '节奏可接受',
};

const neptuneSupport: PersonaEvaluation = {
  persona: 'NEPTUNE',
  utility: 0.85,
  primaryConcerns: [],
  positiveAspects: [],
  suggestedAdjustments: [],
  stance: 'STRONG_SUPPORT',
  confidence: 0.9,
  reasoning: '体验完整',
};

describe('guardian-decision-policy.util', () => {
  it('counts hard violations', () => {
    expect(countHardViolations(baseEval(2))).toBe(2);
    expect(countHardViolations(baseEval(0))).toBe(0);
  });

  it('veto when hard violations present regardless of other personas', () => {
    expect(
      resolveHardConstraintVeto(
        [abuHardBlock, dreSupport, neptuneSupport],
        baseEval(1),
      ),
    ).toBe('REJECT');
  });

  it('veto when Abu STRONG_OPPOSE cites hard constraint without objectiveFunction hardViolations', () => {
    expect(
      resolveHardConstraintVeto(
        [abuHardBlock, dreSupport, neptuneSupport],
        baseEval(0),
      ),
    ).toBe('REJECT');
  });

  it('no veto when Abu oppose is soft-only', () => {
    const abuSoft: PersonaEvaluation = {
      ...abuHardBlock,
      primaryConcerns: ['天气可能不佳，建议关注预报'],
      stance: 'CONCERN',
    };
    expect(
      resolveHardConstraintVeto([abuSoft, dreSupport, neptuneSupport], baseEval(0)),
    ).toBeNull();
  });

  it('buildHardConstraintVetoSummary mentions hard count', () => {
    expect(buildHardConstraintVetoSummary(baseEval(2))).toMatch(/2 项硬约束/);
  });
});
