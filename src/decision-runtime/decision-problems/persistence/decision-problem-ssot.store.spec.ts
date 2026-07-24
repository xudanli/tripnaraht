import { DecisionProblemSsotStoreService } from './decision-problem-ssot.store';
import type { DecisionProblemDetail } from '../../../trips/decision-semantics/types/decision-semantics.types';

describe('DecisionProblemSsotStoreService.loadAuthoritative', () => {
  const contextVersion = {
    planVersionId: 'pv_1',
    policyVersion: 1,
    worldRevision: 'wr_1',
    rulePackVersion: 'pack_1',
  };

  const problem: DecisionProblemDetail = {
    id: 'dp_TEST',
    tripId: 'trip-1',
    type: 'INFEASIBILITY',
    title: 'Test',
    description: 'Test problem',
    detectedBy: 'FEASIBILITY',
    detectedAt: '2026-07-03T00:00:00.000Z',
    tripVersion: '1',
    affectedScope: [],
    status: 'OPEN',
    semanticKey: 'TEST',
    sourceRefs: [{ system: 'FEASIBILITY', refId: 'issue-1' }],
    assertionIds: ['ca_1'],
    assertions: [],
  };

  it('CAS-021: returns cached problems without calling synthesize when fresh', async () => {
    const synthesize = jest.fn();
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          metadata: {
            decisionProblemSsot: {
              schemaId: 'tripnara.decision_problem_ssot@v1',
              contextVersion,
              synthesizedAt: '2026-07-03T00:00:00.000Z',
              byProblemId: { dp_TEST: problem },
            },
          },
        }),
        update: jest.fn(),
      },
    };
    const store = new DecisionProblemSsotStoreService(prisma as never);

    const result = await store.loadAuthoritative('trip-1', contextVersion, synthesize);
    expect(result.fromStore).toBe(true);
    expect(result.problems).toHaveLength(1);
    expect(synthesize).not.toHaveBeenCalled();
  });
});
