import {
  applyPackEvaluationToAssertionEnvelope,
  executePackRuleConstraint,
} from './pack-rule-constraint.executor';

describe('executePackRuleConstraint (EXEC)', () => {
  const prev = process.env.DECISION_PACK_RULES;

  beforeEach(() => {
    process.env.DECISION_PACK_RULES = '1';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prev;
  });

  it('EXEC-001: returns undefined when flag off', () => {
    process.env.DECISION_PACK_RULES = '0';
    expect(
      executePackRuleConstraint({
        country: 'IS',
        semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
        facts: { road: { status: 'CLOSED' } },
        candidateUsesRoute: true,
      }),
    ).toBeUndefined();
  });

  it('EXEC-002: CLOSED on route → BLOCK material', () => {
    const result = executePackRuleConstraint({
      country: 'IS',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      facts: { road: { status: 'CLOSED' } },
      candidateUsesRoute: true,
      ruleVersionPrefix: 'test-abu',
    });
    expect(result?.matched).toBe(true);
    expect(result?.ruleId).toBe('IS_ROAD_CLOSED_BLOCK');
    expect(result?.verdict).toBe('BLOCK');
    expect(result?.ruleVersion).toContain('pack:IS_ROAD_CLOSED_BLOCK');
  });

  it('EXEC-003: applyPackEvaluationToAssertionEnvelope merges fields', () => {
    const evaluation = executePackRuleConstraint({
      country: 'IS',
      semanticKey: 'ROAD_SEGMENT_RESTRICTED',
      facts: { road: { status: 'LIMITED' } },
      candidateUsesRoute: true,
    })!;
    const merged = applyPackEvaluationToAssertionEnvelope(
      {
        assertionId: 'a1',
        verdict: 'PASS',
        constraintCode: '',
        reasonCodes: [],
        overridable: true,
        ruleVersion: 'old',
      },
      evaluation,
    );
    expect(merged.verdict).toBe('WARNING');
    expect(merged.reasonCodes).toContain('ROAD_SEGMENT_RESTRICTED');
    expect(merged.ruleVersion).toContain('IS_ROAD_LIMITED_WARN');
  });
});
