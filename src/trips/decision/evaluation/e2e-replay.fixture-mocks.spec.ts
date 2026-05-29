import { buildDecisionLogsForFixture } from './e2e-replay.fixture-mocks';
import { buildDecisionTraceSummary } from './replay-trace-contract';

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

  it('merges traceSignals into PLAN_SCORE metadata when expected.traceSignals is set', () => {
    const testCase: any = {
      id: 'trace-sig-1',
      name: 'n',
      description: 'd',
      input: { userProfile: {}, season: 1, countryCode: 'IS', userQuery: 'q' },
      expected: {
        abuExpected: { action: 'ALLOW' },
        finalState: { allowed: true, planDays: 3 },
        traceSummary: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'audit',
          candidateSearchBudget: {
            maxCandidates: 8,
            repairMaxIters: 1,
            repairTopKPerCandidate: 2,
            maxNewCandidatesPerIter: 8,
            maxPoolSize: 16,
          },
          candidateSearchAudit: {
            budget: {
              maxCandidates: 8,
              repairMaxIters: 1,
              repairTopKPerCandidate: 2,
              maxNewCandidatesPerIter: 8,
              maxPoolSize: 16,
            },
            initialVariantCount: 2,
            iterations: [
              {
                iter: 0,
                poolSizeBeforeProjection: 3,
                feasibleCountAfterProjection: 3,
                infeasibleCountAfterProjection: 0,
                repairsGenerated: 0,
                repairsAccepted: 0,
                poolSizeAfterDedup: 3,
              },
            ],
            finalCandidateCount: 3,
            finalFeasibleCount: 3,
            stopReason: 'COMPLETED',
          },
        },
        traceSignals: {
          stability_mode_active: true,
          frustration_circuit_triggered: true,
          narrative_track: 'EMPATHY_RECOVERY',
        },
      },
    };
    const logs = buildDecisionLogsForFixture(testCase);
    const planScore = logs.find((l) => l.decisionStage === 'PLAN_SCORE') as any;
    expect(planScore.metadata.stability_mode_active).toBe(true);
    expect(planScore.metadata.frustration_circuit_triggered).toBe(true);
    expect(planScore.metadata.narrative_track).toBe('EMPATHY_RECOVERY');
  });

  it('injects dilemmaElicitationHint into PLAN_SCORE metadata and trace summary', () => {
    const testCase: any = {
      id: 'dilemma-trace-1',
      name: 'n',
      description: 'd',
      input: { userProfile: {}, season: 1, countryCode: 'IS', userQuery: 'q' },
      expected: {
        abuExpected: { action: 'ALLOW' },
        finalState: { allowed: true, planDays: 2 },
        traceSummary: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'audit',
          candidateSearchBudget: {
            maxCandidates: 6,
            repairMaxIters: 1,
            repairTopKPerCandidate: 2,
            maxNewCandidatesPerIter: 6,
            maxPoolSize: 12,
          },
          candidateSearchAudit: {
            budget: {
              maxCandidates: 6,
              repairMaxIters: 1,
              repairTopKPerCandidate: 2,
              maxNewCandidatesPerIter: 6,
              maxPoolSize: 12,
            },
            initialVariantCount: 2,
            iterations: [],
            finalCandidateCount: 2,
            finalFeasibleCount: 2,
            stopReason: 'COMPLETED',
          },
          dilemmaElicitationHint: {
            reason: 'EVIDENCE_CONTRADICTION',
            crossSpread: 0.62,
            hint: 'Ask user risk vs scenery tradeoff.',
          },
        },
      },
    };
    const logs = buildDecisionLogsForFixture(testCase);
    const planScore = logs.find((l) => l.decisionStage === 'PLAN_SCORE') as any;
    expect(planScore.metadata.dilemmaElicitationHint?.crossSpread).toBe(0.62);
    const summary = buildDecisionTraceSummary(logs as any);
    expect(summary.dilemmaElicitationHint?.reason).toBe('EVIDENCE_CONTRADICTION');
    expect(summary.dilemmaElicitationHint?.crossSpread).toBe(0.62);
  });

  it('buildDecisionTraceSummary derives dilemmaElicitationHint from observationHarness.suggestDilemmaElicitation', () => {
    const logs: any[] = [
      {
        persona: 'EXPECTED_UTILITY',
        action: 'EVALUATE',
        explanation: 'e',
        reasonCodes: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'UTILITY',
        decisionStage: 'PLAN_SCORE',
        metadata: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'm',
          candidateSearchBudget: { maxCandidates: 4, repairMaxIters: 1, repairTopKPerCandidate: 1, maxNewCandidatesPerIter: 4, maxPoolSize: 8 },
          candidateSearchAudit: {
            budget: { maxCandidates: 4, repairMaxIters: 1, repairTopKPerCandidate: 1, maxNewCandidatesPerIter: 4, maxPoolSize: 8 },
            iterations: [],
            finalCandidateCount: 1,
            finalFeasibleCount: 1,
            stopReason: 'COMPLETED',
          },
          observationHarness: {
            suggestDilemmaElicitation: { reason: 'EVIDENCE_CONTRADICTION', crossSpread: 0.88, hint: 'Prefer user choice' },
          },
        },
      },
    ];
    const s = buildDecisionTraceSummary(logs);
    expect(s.dilemmaElicitationHint?.crossSpread).toBe(0.88);
    expect(s.dilemmaElicitationHint?.hint).toBe('Prefer user choice');
  });
});

