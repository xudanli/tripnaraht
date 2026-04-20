import { DecisionReplaySkill } from './decision-replay.skill';
import { E2EReplayResult } from '../../trips/decision/evaluation/e2e-case.types';

describe('DecisionReplaySkill', () => {
  function makeReplayResult(): E2EReplayResult {
    return {
      case: {
        id: 'case-1',
        name: 'case',
        description: 'desc',
        input: {
          userProfile: {},
          season: 7,
          countryCode: 'IS',
          userQuery: 'test',
        },
        expected: {
          abuExpected: {
            action: 'ALLOW',
          },
          finalState: {
            allowed: true,
          },
        },
      } as any,
      actual: {
        routeDirectionId: 'route-1',
        finalPlan: {
          days: 3,
          allowed: true,
        },
        logs: [
          {
            persona: 'EXPECTED_UTILITY',
            action: 'ALLOW',
            explanation: 'ok',
            reasonCodes: [],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'MODEL',
            decisionStage: 'PLAN_SCORE',
            metadata: {
              metaDecisionAudit: 'entropy=0.8;cand=18',
              candidateSearchBudget: {
                maxCandidates: 18,
              },
              candidateSearchAudit: {
                initialVariantCount: 4,
                stopReason: 'COMPLETED',
              },
            },
          } as any,
        ],
      },
      diff: {
        hasDiff: false,
      },
      passed: true,
      executionTime: 12,
    };
  }

  it('surfaces whitelisted metadata diffs from expected logs', async () => {
    const replayResult = makeReplayResult();
    const e2eReplayService = {
      replay: jest.fn().mockResolvedValue(replayResult),
    };
    const skill = new DecisionReplaySkill(e2eReplayService as any, undefined);

    const output = await skill.execute({
      testCase: replayResult.case as any,
      expectedLogs: [
        {
          ...replayResult.actual.logs[0],
          metadata: {
            metaDecisionAudit: 'entropy=0.8;cand=12',
            candidateSearchBudget: {
              maxCandidates: 12,
            },
          },
        } as any,
      ],
    });

    expect(output.passed).toBe(false);
    expect(output.diff?.hasDiff).toBe(true);
    expect(output.diff?.logDiffs).toHaveLength(1);
    expect(output.diff?.logDiffs?.[0].diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'metadata.metaDecisionAudit',
        }),
        expect.objectContaining({
          key: 'metadata.candidateSearchBudget',
        }),
      ]),
    );
  });

  it('builds trace summary from replay metadata', async () => {
    const replayResult = makeReplayResult();
    const e2eReplayService = {
      replay: jest.fn().mockResolvedValue(replayResult),
    };
    const skill = new DecisionReplaySkill(e2eReplayService as any, undefined);

    const output = await skill.execute({
      testCase: replayResult.case as any,
    });

    expect(output.traceSummary?.metaDecisionAudit).toBe('entropy=0.8;cand=18');
    expect((output.traceSummary?.candidateSearchBudget as any)?.maxCandidates).toBe(18);
    expect((output.traceSummary?.candidateSearchAudit as any)?.initialVariantCount).toBe(4);
  });

  it('passes through structured trace diff from replay result', async () => {
    const replayResult = makeReplayResult();
    replayResult.diff = {
      hasDiff: true,
      traceDiff: [
        {
          key: 'metaDecisionAudit',
          expected: 'entropy=0.8;cand=12',
          actual: 'entropy=0.8;cand=18',
          message: 'trace.metaDecisionAudit: expected="entropy=0.8;cand=12" actual="entropy=0.8;cand=18"',
        },
      ],
    };

    const e2eReplayService = {
      replay: jest.fn().mockResolvedValue(replayResult),
    };
    const skill = new DecisionReplaySkill(e2eReplayService as any, undefined);

    const output = await skill.execute({
      testCase: replayResult.case as any,
    });

    expect(output.diff?.traceDiff).toEqual([
      expect.objectContaining({
        key: 'metaDecisionAudit',
        actual: 'entropy=0.8;cand=18',
      }),
    ]);
  });
});
