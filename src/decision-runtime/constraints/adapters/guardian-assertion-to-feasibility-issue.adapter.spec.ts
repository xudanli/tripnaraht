import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { guardianAssertionToFeasibilityIssue } from './guardian-assertion-to-feasibility-issue.adapter';

describe('guardian-assertion-to-feasibility-issue.adapter', () => {
  const assertion: ConstraintAssertion = {
    assertionId: 'ga_road_f208',
    constraintType: 'ROAD_SEGMENT_UNAVAILABLE',
    status: 'BLOCK',
    severity: 'CRITICAL',
    scope: { tripId: 'trip-1', roadSegmentIds: ['F208'] },
    reasonCode: 'ROAD_CLOSED',
    evidenceRefs: ['evt_1'],
    message: 'ROAD_SEGMENT_UNAVAILABLE',
    evaluator: {
      engine: 'guardian-assertion',
      version: '0.1.0',
      ruleId: 'ROAD_SEGMENT_UNAVAILABLE',
    },
    overridable: false,
    confidence: 0.95,
  };

  it('CAS-015: maps guardian BLOCK to must_handle transport issue', () => {
    const issue = guardianAssertionToFeasibilityIssue(assertion);
    expect(issue.priority).toBe('must_handle');
    expect(issue.category).toBe('transport');
    expect(issue.proofs?.[0]?.evidenceSource).toBe('guardian-assertion');
    expect(issue.semanticKey).toBe('ROAD_SEGMENT_UNAVAILABLE');
  });
});
