import {
  buildHumanDecisionPointStrings,
  buildPresentationFromOptimizeResult,
  isNegotiationHardBlocked,
  mapNegotiationResultToApiSummary,
  mapTeamNegotiationToApiResponse,
} from './guardian-negotiation-api.mapper';
import type { NegotiationResult } from '../learning/guardian-persona.interface';

describe('guardian-negotiation-api.mapper', () => {
  const baseResult: NegotiationResult = {
    decision: 'REQUIRES_HUMAN',
    evaluations: [
      {
        persona: 'ABU',
        stance: 'CONCERN',
        utility: 0.5,
        primaryConcerns: [],
        suggestedAdjustments: ['改走 B 线'],
        reasoning: '',
      },
      {
        persona: 'DRE',
        stance: 'NEUTRAL',
        utility: 0.6,
        primaryConcerns: [],
        suggestedAdjustments: ['减少第 3 天强度'],
        reasoning: '',
      },
      {
        persona: 'NEPTUNE',
        stance: 'SUPPORT',
        utility: 0.7,
        primaryConcerns: [],
        suggestedAdjustments: [],
        reasoning: '',
      },
    ],
    debateRounds: [],
    votes: [],
    consensusLevel: 0.55,
    keyTradeoffs: ['体力 vs 体验'],
    summary: '需要人类判断',
  };

  it('maps NEEDS_HUMAN with humanDecisionPoints', () => {
    const api = mapNegotiationResultToApiSummary(baseResult);
    expect(api.decision).toBe('NEEDS_HUMAN');
    expect(api.humanDecisionPoints?.length).toBeGreaterThan(0);
    expect(api.hardConstraintBlocked).toBeUndefined();
  });

  it('strips humanDecisionPoints on hard REJECT', () => {
    const reject: NegotiationResult = {
      ...baseResult,
      decision: 'REJECT',
      evaluations: [
        {
          persona: 'ABU',
          stance: 'STRONG_OPPOSE',
          utility: 0.1,
          primaryConcerns: ['F 路封闭'],
          suggestedAdjustments: [],
          reasoning: '',
        },
        ...baseResult.evaluations.slice(1),
      ],
      summary: '硬约束否决',
    };
    const api = mapNegotiationResultToApiSummary(reject);
    expect(api.decision).toBe('REJECT');
    expect(api.humanDecisionPoints).toBeUndefined();
    expect(api.hardConstraintBlocked).toBe(true);
  });

  it('maps team negotiation with flat humanDecisionPoints', () => {
    const team = mapTeamNegotiationToApiResponse({
      decision: 'REQUIRES_DISCUSSION',
      consensusLevel: 0.5,
      memberEvaluations: [],
      teamWeights: {} as never,
      teamUtility: 0.6,
      conflicts: [],
      recommendedAdjustments: [],
      humanDecisionPoints: [
        {
          id: 'c1',
          question: '如何协调？',
          options: ['多数决定', '重新规划'],
          recommendation: '重新规划',
        },
      ],
      summary: '需讨论',
    });
    expect(team.humanDecisionPointsFlat).toEqual(['多数决定', '重新规划']);
    expect(team.teamConstraintsSatisfied).toBe(true);
  });

  it('builds presentation from optimize result with CHOOSE', () => {
    const presentation = buildPresentationFromOptimizeResult({
      plan: null,
      allowed: true,
      finalAction: 'ADJUST',
      logs: [],
      objectiveEvaluation: {} as never,
      abuResult: {
        allowed: true,
        action: 'ALLOW_WITH_CONDITIONS',
        conditions: ['部分路段有风险'],
        evaluation: { repairSuggestions: [] },
      } as never,
      dreResult: {
        needsAdjustment: true,
        summary: { improvementPct: 5 },
      } as never,
      summary: {} as never,
      chooseRequired: true,
      humanDecisionPointsFlat: ['接受', '调整'],
    });
    expect(presentation.actions.user).toBe('CHOOSE');
    expect(presentation.leadSpeaker).toBeDefined();
  });
});

describe('buildHumanDecisionPointStrings', () => {
  it('prefers suggestedAdjustments over persona prefixes', () => {
    const points = buildHumanDecisionPointStrings({
      ...({} as NegotiationResult),
      decision: 'REQUIRES_HUMAN',
      evaluations: [
        {
          persona: 'NEPTUNE',
          stance: 'CONCERN',
          utility: 0.5,
          primaryConcerns: [],
          suggestedAdjustments: ['冰川改上午'],
          reasoning: '',
        },
      ],
      debateRounds: [],
      votes: [],
      consensusLevel: 0.5,
      keyTradeoffs: [],
      summary: '',
    });
    expect(points).toContain('冰川改上午');
  });
});
