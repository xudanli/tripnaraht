/**
 * GuardianDebateService：硬约束不可投票
 */

import { GuardianDebateService } from './guardian-debate.service';
import type { ObjectiveEvaluationResult } from '../objective-function.interface';
import type { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';

describe('GuardianDebateService hard constraint veto', () => {
  const plan: RoutePlanDraft = {
    tripId: 'trip-debate-01',
    routeDirectionId: 'rd-1',
    segments: [],
  };
  const world = { physical: { month: 7 } } as WorldModelContext;

  function makeEvaluation(hardCount: number): ObjectiveEvaluationResult {
    return {
      totalUtility: 0.72,
      isFeasible: hardCount === 0,
      breakdown: {
        safetyScore: hardCount > 0 ? 0.3 : 0.85,
        experienceScore: 0.8,
        philosophyScore: 0.82,
        timeSlackScore: 0.7,
        weatherRiskPenalty: 0.05,
        fatigueRiskPenalty: 0.08,
        pacingVariancePenalty: 0.05,
        budgetRiskPenalty: 0,
        crowdAvoidanceScore: 0.5,
      },
      constraints: {
        hardViolations: Array.from({ length: hardCount }, (_, i) => ({
          constraintId: `HC_${i}`,
          violationDegree: 1,
          violationExplanation: 'blocked',
        })),
        softViolations: [],
      },
      metrics: { hardViolationCount: hardCount },
    } as ObjectiveEvaluationResult;
  }

  it('returns REJECT immediately when hard violations exist even with high consensus', async () => {
    const objectiveFunction = {
      evaluate: jest.fn().mockReturnValue(makeEvaluation(1)),
      weights: {
        safety: 0.25,
        experienceDensity: 0.2,
        philosophyAlignment: 0.15,
        timeSlack: 0.1,
        fatigueRisk: 0.1,
        weatherRisk: 0.1,
        budgetRisk: 0.05,
        crowdAvoidance: 0.05,
      },
    };
    const tdfpm = {
      calculateDayFatigue: jest.fn().mockReturnValue({
        fatigueScore: 0.4,
        riskLevel: 'LOW',
        recommendation: 'ok',
      }),
    };

    const service = new GuardianDebateService(
      objectiveFunction as never,
      tdfpm as never,
    );

    const result = await service.negotiate(plan, world, {
      consensusThreshold: 0.5,
      maxDebateRounds: 0,
      humanInterventionThreshold: 0.4,
      requireUnanimity: false,
      allowConditionalApproval: true,
      votingWeightMode: 'EQUAL',
    });

    expect(result.decision).toBe('REJECT');
    expect(result.debateRounds).toHaveLength(0);
    expect(result.summary).toMatch(/硬约束/);
    expect(result.evaluations.find((e) => e.persona === 'ABU')?.stance).toBe(
      'STRONG_OPPOSE',
    );
  });
});
