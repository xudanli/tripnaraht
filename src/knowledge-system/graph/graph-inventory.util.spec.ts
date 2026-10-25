import { countConnectedComponents, weekDeltas } from './graph-inventory.util';
import type { KnowledgeRelation } from '../contracts/knowledge-relation.types';
import { inferGraphNodeType } from './infer-graph-node-type.util';

function rel(
  id: string,
  from: string,
  to: string,
  createdAt?: string,
): KnowledgeRelation {
  return {
    relationId: id,
    type: 'NEAR',
    from,
    to,
    confidence: 0.9,
    source: 'manual',
    createdAt,
  };
}

describe('inferGraphNodeType', () => {
  it('uses canonical id shape, not a hardcoded country', () => {
    expect(inferGraphNodeType('is.gullfoss')).toBe('Place');
    expect(inferGraphNodeType('jp.tokyo')).toBe('Place');
    expect(inferGraphNodeType('segment:is:f208')).toBe('RouteSegment');
    expect(inferGraphNodeType('risk:ENV-WIND-01')).toBe('Risk');
    expect(inferGraphNodeType('unknown-blob')).toBe('Entity');
  });
});

describe('graph inventory', () => {
  it('counts connected components', () => {
    const rels = [
      rel('a', 'n1', 'n2'),
      rel('b', 'n2', 'n3'),
      rel('c', 'x1', 'x2'),
    ];
    expect(countConnectedComponents(rels)).toBe(2);
  });

  it('week deltas treat missing createdAt as new', () => {
    const old = rel('old', 'a', 'b', new Date(Date.now() - 20 * 86400000).toISOString());
    const neu = rel('new', 'c', 'd');
    const d = weekDeltas([old, neu]);
    expect(d.edgeDeltaWeek).toBe(1);
    expect(d.nodeDeltaWeek).toBe(2);
  });
});
