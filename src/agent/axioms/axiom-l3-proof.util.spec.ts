import { buildL3ProofPrefixFromMatch } from './axiom-l3-proof.util';
import { AXIOM_REGISTRY } from './axiom-registry';

describe('axiom-l3-proof.util', () => {
  it('buildL3ProofPrefixFromMatch uses metric_details from evidence', () => {
    const prefix = buildL3ProofPrefixFromMatch(
      {
        axiom: AXIOM_REGISTRY.FATIGUE_OVERLOAD,
        axiom_id: 'FATIGUE_OVERLOAD',
        evidence: {
          match_source: 'CLARIFICATION',
          metric_details: {
            actual: 11,
            limit: 8,
            unit: 'h',
            cmp: 'LEQ',
            slack: -3,
          },
        },
      },
      'DAY:INTAKE',
    );
    expect(prefix).toContain('actual:11');
    expect(prefix).toContain('limit:8');
    expect(prefix).toContain('evidence:CLARIFICATION');
  });
});
