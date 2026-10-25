import { projectGoldenSetRelations } from './project-golden-set-relations.util';
import { projectPoiAlternativeRelations } from './project-poi-alternative-relations.util';
import { projectCausalChainRelations } from './project-causal-chain-relations.util';
import { KNOWLEDGE_RELATION_TYPES_V1 } from '../contracts/knowledge-relation.types';

describe('relation adapters', () => {
  it('projects golden set CO_VISIT / SOFT_ALTERNATIVE', () => {
    const { relations, projections } = projectGoldenSetRelations();
    expect(relations.length).toBeGreaterThan(0);
    expect(relations.every((r) => r.source === 'golden_set')).toBe(true);
    expect(
      relations.some((r) => r.type === 'CO_VISIT' || r.type === 'SOFT_ALTERNATIVE'),
    ).toBe(true);
    expect(projections.some((p) => p.originalType === 'CO_VISIT_CLUSTER')).toBe(true);
    expect(relations.every((r) => r.from.startsWith('place:db:'))).toBe(true);
  });

  it('projects POI alternatives to ALTERNATIVE_TO + SOFT_ALTERNATIVE', () => {
    const { relations } = projectPoiAlternativeRelations();
    expect(relations.length).toBeGreaterThan(0);
    const dyr = relations.filter((r) => r.from === 'is.dyrholaey' && r.to === 'is.reynisfjara');
    expect(dyr.some((r) => r.type === 'ALTERNATIVE_TO')).toBe(true);
    expect(dyr.some((r) => r.type === 'SOFT_ALTERNATIVE')).toBe(true);
    expect(dyr.every((r) => r.country === 'IS')).toBe(true);
  });

  it('projects causal chains CAUSES → INCREASES_RISK_OF', () => {
    const { relations, projections } = projectCausalChainRelations();
    expect(relations.length).toBeGreaterThan(10);
    expect(relations.some((r) => r.type === 'INCREASES_RISK_OF')).toBe(true);
    expect(relations.some((r) => r.from.startsWith('risk:'))).toBe(true);
    expect(projections.some((p) => p.originalType === 'CAUSES')).toBe(true);
    expect(
      relations.every((r) =>
        (KNOWLEDGE_RELATION_TYPES_V1 as readonly string[]).includes(r.type),
      ),
    ).toBe(true);
  });
});
