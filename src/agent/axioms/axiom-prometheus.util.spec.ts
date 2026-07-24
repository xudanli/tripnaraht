import {
  axiomMatchSourceForMetrics,
  normalizeAxiomCidForMetrics,
} from './axiom-prometheus.util';
import { AXIOM_REGISTRY } from './axiom-registry';

describe('axiom-prometheus.util', () => {
  it('normalizeAxiomCidForMetrics maps empty and unknown.unattributed to NONE', () => {
    expect(normalizeAxiomCidForMetrics('')).toBe('NONE');
    expect(normalizeAxiomCidForMetrics('unknown.unattributed')).toBe('NONE');
    expect(normalizeAxiomCidForMetrics(AXIOM_REGISTRY.FATIGUE_OVERLOAD.cid)).toBe(
      'human.fatigue_capacity',
    );
  });

  it('axiomMatchSourceForMetrics reads evidence.match_source', () => {
    expect(
      axiomMatchSourceForMetrics({
        evidence: { match_source: 'CLARIFICATION', metric_details: {} as any },
      }),
    ).toBe('CLARIFICATION');
    expect(axiomMatchSourceForMetrics({ evidence: {} })).toBe('UNKNOWN');
  });
});
