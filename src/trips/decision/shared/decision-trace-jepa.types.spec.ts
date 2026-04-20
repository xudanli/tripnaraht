import {
  extractJepaTraceFromMetadata,
  JEPA_TRACE_CONTRACT_VERSION,
  mergeMetadataWithJepaTrace,
  minimalJepaTraceForCandidate,
} from './decision-trace-jepa.types';

describe('decision-trace-jepa.types', () => {
  it('minimalJepaTraceForCandidate matches contract version', () => {
    const t = minimalJepaTraceForCandidate('cand-1');
    expect(t.contractVersion).toBe(JEPA_TRACE_CONTRACT_VERSION);
    expect(t.candidateId).toBe('cand-1');
  });

  it('mergeMetadataWithJepaTrace embeds under jepaTrace key', () => {
    const m = mergeMetadataWithJepaTrace({ foo: 1 }, minimalJepaTraceForCandidate('x'));
    expect(m.foo).toBe(1);
    expect((m.jepaTrace as { candidateId: string }).candidateId).toBe('x');
  });

  it('extractJepaTraceFromMetadata returns undefined for wrong version', () => {
    expect(extractJepaTraceFromMetadata({ jepaTrace: { contractVersion: 'other', candidateId: 'a' } })).toBeUndefined();
  });

  it('extractJepaTraceFromMetadata roundtrips merge output', () => {
    const merged = mergeMetadataWithJepaTrace({}, minimalJepaTraceForCandidate('z'));
    expect(extractJepaTraceFromMetadata(merged)?.candidateId).toBe('z');
  });
});
