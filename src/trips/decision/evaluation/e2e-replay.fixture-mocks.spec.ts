import { buildDecisionLogsForFixture } from './e2e-replay.fixture-mocks';

describe('e2e replay fixture mocks', () => {
  it('normalizes candidateSearchAudit final counts from iterations', () => {
    const testCase: any = {
      id: 'case-1',
      name: 'case',
      description: 'desc',
      input: { userProfile: {}, season: 7, countryCode: 'IS', userQuery: 'q' },
      expected: {
        abuExpected: { action: 'ALLOW' },
        finalState: { allowed: true, planDays: 7 },
        traceSummary: {
          metaDecisionAudit: 'audit',
          candidateSearchBudget: {
            maxCandidates: 10,
            repairMaxIters: 2,
            repairTopKPerCandidate: 3,
            maxNewCandidatesPerIter: 10,
            maxPoolSize: 20,
          },
          candidateSearchAudit: {
            budget: {
              maxCandidates: 10,
              repairMaxIters: 2,
              repairTopKPerCandidate: 3,
              maxNewCandidatesPerIter: 10,
              maxPoolSize: 20,
            },
            initialVariantCount: 4,
            iterations: [
              {
                iter: 0,
                poolSizeBeforeProjection: 6,
                feasibleCountAfterProjection: 4,
                infeasibleCountAfterProjection: 2,
                repairsGenerated: 2,
                repairsAccepted: 1,
                poolSizeAfterDedup: 12,
              },
            ],
            // intentionally wrong: should be derived from iteration (min(maxCandidates, poolAfterDedup)=10)
            finalCandidateCount: 999,
            finalFeasibleCount: 999,
            stopReason: 'COMPLETED',
          },
        },
      },
    };

    const logs = buildDecisionLogsForFixture(testCase);
    const planScore = logs.find((l) => l.persona === 'EXPECTED_UTILITY' && l.decisionStage === 'PLAN_SCORE') as any;
    expect(planScore).toBeDefined();
    expect(planScore.metadata.candidateSearchAudit.finalCandidateCount).toBe(10);
    expect(planScore.metadata.candidateSearchAudit.finalFeasibleCount).toBe(4);
    expect(planScore.metadata.candidateSearchAudit.budget.maxCandidates).toBe(10);
  });
});

