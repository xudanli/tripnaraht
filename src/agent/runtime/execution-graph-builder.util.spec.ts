import { buildExecutionGraphSnapshot } from './execution-graph-builder.util';

describe('execution-graph-builder.util', () => {
  it('uses dedup replay sink when pathKind is DEDUP_REPLAY', () => {
    const g = buildExecutionGraphSnapshot({
      queryId: 'q1',
      requestId: 'req1',
      artifactId: 'art1',
      kernelTag: 'REASONING_KERNEL',
      pathKind: 'DEDUP_REPLAY',
      includeProofNode: false,
    });
    expect(g.nodes.map((n) => n.id)).toContain('n:req1:dedup_replay');
    expect(g.nodes.find((n) => n.id === 'n:req1:dedup_replay')?.kind).toBe('REPLAY');
  });

  it('uses fresh sink when pathKind is FRESH_EXECUTION', () => {
    const g = buildExecutionGraphSnapshot({
      queryId: 'q1',
      requestId: 'req1',
      artifactId: 'art1',
      kernelTag: 'LIGHTWEIGHT_KERNEL',
      pathKind: 'FRESH_EXECUTION',
      includeProofNode: false,
    });
    expect(g.nodes.map((n) => n.id)).toContain('n:req1:fresh_sink');
    expect(g.nodes.find((n) => n.id === 'n:req1:fresh_sink')?.kind).toBe('OBSERVATION');
  });
});
