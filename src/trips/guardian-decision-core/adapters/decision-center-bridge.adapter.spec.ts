import {
  bridgeRfc001ProblemToDecisionProblemSummary,
  resolveLeadingPersona,
} from '../adapters/decision-center-bridge.adapter';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';

const problem: Rfc001DecisionProblem = {
  problemId: 'problem_1',
  tripId: 'trip_1',
  planVersionId: 'plan_v17',
  type: 'FEASIBILITY_FAILURE',
  triggerEventId: 'evt_1',
  affectedEntityRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg-1', label: 'F208' }],
  affectedPlanItemIds: ['item-1'],
  worldStateSnapshotId: 'wss_1',
  detectedAt: '2026-06-30T10:00:00Z',
  urgency: 'HIGH',
  status: 'WAITING_HUMAN',
};

describe('decision-center-bridge.adapter', () => {
  it('road close → Abu leading persona', () => {
    expect(resolveLeadingPersona(problem)).toBe('ABU');
  });

  it('bridges affectedPlanItemIds to affectedScopeDisplay', () => {
    const summary = bridgeRfc001ProblemToDecisionProblemSummary(problem, '17');
    expect(summary.affectedScopeDisplay?.some((s) => s.scopeId === 'item-1')).toBe(true);
    expect(summary.type).toBe('INFEASIBILITY');
    expect(summary.status).toBe('WAITING_DECISION');
    expect(summary.semanticKey).toBe('ROAD_SEGMENT_UNAVAILABLE:evt_1');
  });
});
