import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { canonicalAssertionToAssessment } from './assertion-to-assessment.adapter';

describe('assertion-to-assessment.adapter', () => {
  const contextVersion = {
    planVersionId: 'plan_rev1',
    policyVersion: 2,
    worldRevision: 'w1',
    rulePackVersion: 'destination.is@1.0.0',
  };

  const baseAssertion: ConstraintAssertion = {
    assertionId: 'gw_road_f208',
    constraintType: 'ROAD_SEGMENT_UNAVAILABLE',
    status: 'BLOCK',
    severity: 'CRITICAL',
    scope: { tripId: 'trip-1', roadSegmentIds: ['F208'] },
    reasonCode: 'ROAD_CLOSED',
    evidenceRefs: ['evt_1'],
    message: 'F208 closed',
    evaluator: { engine: 'guardian', version: '1' },
    overridable: false,
  };

  it('CAS-001: maps gateway assertion to assessment', () => {
    const a = canonicalAssertionToAssessment(baseAssertion, {
      tripId: 'trip-1',
      evaluationMode: 'PLAN_VERIFY',
      contextVersion,
      evaluatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(a.assessmentId).toBe('assess_gw_gw_road_f208');
    expect(a.semanticKey).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(a.status).toBe('BLOCK');
    expect(a.sourceRef.system).toBe('GATEWAY');
  });
});
